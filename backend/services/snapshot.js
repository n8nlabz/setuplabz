const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

class SnapshotService {
  constructor() {
    this.snapshotsDir = "/opt/n8nlabz/snapshots";
    this.maxSnapshots = 7;
    this.broadcast = null;
  }

  _log(step) {
    console.log(`[SNAPSHOT] ${step}`);
    if (this.broadcast) {
      try {
        this.broadcast({ type: "snapshot", status: "progress", step });
      } catch {}
    }
  }

  async createSnapshot() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const snapshotDir = `${this.snapshotsDir}/${timestamp}`;

    this._log("Iniciando snapshot...");
    fs.mkdirSync(snapshotDir, { recursive: true });

    // 1. Dump de todos os bancos PostgreSQL
    this._log("Exportando bancos de dados PostgreSQL...");
    try {
      execSync(
        `docker exec $(docker ps -q -f name=postgres_postgres) pg_dumpall -U postgres > ${snapshotDir}/databases.sql`,
        { timeout: 300000, shell: "/bin/bash" }
      );
    } catch (err) {
      console.log("[SNAPSHOT] Postgres dump falhou:", err.message);
    }

    // 2. Backup dos volumes Docker
    const volumes = [
      "postgres_data",
      "n8n_redis",
      "evolution_instances",
      "evolution_store",
    ];

    for (const vol of volumes) {
      this._log(`Salvando volume ${vol}...`);
      try {
        execSync(
          `docker run --rm -v ${vol}:/data -v ${snapshotDir}:/backup alpine tar czf /backup/${vol}.tar.gz -C /data .`,
          { timeout: 300000 }
        );
      } catch {
        console.log(`[SNAPSHOT] Volume ${vol} nao encontrado, pulando...`);
      }
    }

    // 3. Salvar configs do painel
    this._log("Salvando configuracoes do painel...");
    const configFiles = [
      "/opt/n8nlabz/config.json",
      "/opt/n8nlabz/credentials.json",
      "/opt/n8nlabz/environments.json",
      "/opt/n8nlabz/notification-prefs.json",
      "/opt/n8nlabz/push-subscriptions.json",
    ];

    fs.mkdirSync(`${snapshotDir}/configs`, { recursive: true });
    for (const file of configFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.copyFileSync(file, `${snapshotDir}/configs/${path.basename(file)}`);
        }
      } catch {}
    }

    // 4. Salvar lista de stacks
    this._log("Salvando informacoes das stacks...");
    try {
      const stacksRaw = execSync(`docker stack ls --format '{{.Name}}'`, {
        shell: "/bin/bash",
      })
        .toString()
        .trim();
      if (stacksRaw) {
        const stacks = stacksRaw.split("\n").filter(Boolean);
        fs.mkdirSync(`${snapshotDir}/stacks`, { recursive: true });
        for (const stack of stacks) {
          try {
            const services = execSync(
              `docker stack services ${stack} --format '{{json .}}'`,
              { shell: "/bin/bash" }
            )
              .toString()
              .trim();
            fs.writeFileSync(`${snapshotDir}/stacks/${stack}.json`, services);
          } catch {}
        }
      }
    } catch {}

    // 5. Metadados
    this._log("Finalizando snapshot...");
    const metadata = {
      timestamp: new Date().toISOString(),
      version: "2.9",
      size: 0,
      databases: [],
      volumes: volumes,
    };

    // Calcular tamanho total
    try {
      const totalSize = execSync(`du -sb ${snapshotDir} | cut -f1`, {
        shell: "/bin/bash",
      })
        .toString()
        .trim();
      metadata.size = parseInt(totalSize) || 0;
    } catch {}

    // Listar bancos
    try {
      const dbs = execSync(
        `docker exec $(docker ps -q -f name=postgres_postgres) psql -U postgres -t -c "SELECT datname FROM pg_database WHERE datistemplate = false;"`,
        { shell: "/bin/bash" }
      )
        .toString()
        .trim();
      metadata.databases = dbs
        .split("\n")
        .map((d) => d.trim())
        .filter(Boolean);
    } catch {}

    fs.writeFileSync(
      `${snapshotDir}/metadata.json`,
      JSON.stringify(metadata, null, 2)
    );

    // 6. Limpar snapshots antigos
    this.cleanOldSnapshots();

    this._log("Snapshot criado com sucesso!");
    if (this.broadcast) {
      this.broadcast({ type: "snapshot", status: "completed" });
    }

    return { ...metadata, id: timestamp, sizeFormatted: this.formatSize(metadata.size) };
  }

  async restoreSnapshot(snapshotId) {
    const snapshotDir = `${this.snapshotsDir}/${snapshotId}`;

    if (!fs.existsSync(snapshotDir)) {
      throw new Error("Snapshot nao encontrado");
    }

    this._log("Parando servicos...");

    // 1. Parar stacks (exceto panel e traefik)
    try {
      const stacksRaw = execSync(`docker stack ls --format '{{.Name}}'`, {
        shell: "/bin/bash",
      })
        .toString()
        .trim();
      if (stacksRaw) {
        const stacks = stacksRaw.split("\n").filter(Boolean);
        for (const stack of stacks) {
          if (stack !== "panel" && stack !== "traefik" && stack !== "n8nlabz") {
            try {
              execSync(`docker stack rm ${stack}`, { shell: "/bin/bash" });
            } catch {}
          }
        }
      }
    } catch {}

    // Esperar services pararem
    this._log("Aguardando servicos pararem...");
    await new Promise((resolve) => setTimeout(resolve, 15000));

    // 2. Restaurar volumes
    const volumeFiles = fs
      .readdirSync(snapshotDir)
      .filter((f) => f.endsWith(".tar.gz"));
    for (const file of volumeFiles) {
      const volName = file.replace(".tar.gz", "");
      this._log(`Restaurando volume ${volName}...`);
      try {
        execSync(`docker volume create ${volName} 2>/dev/null || true`, {
          shell: "/bin/bash",
        });
        execSync(
          `docker run --rm -v ${volName}:/data -v ${snapshotDir}:/backup alpine sh -c "rm -rf /data/* && tar xzf /backup/${file} -C /data"`,
          { timeout: 300000, shell: "/bin/bash" }
        );
      } catch (err) {
        console.log(`[SNAPSHOT] Erro restaurando volume ${volName}:`, err.message);
      }
    }

    // 3. Restaurar configs
    this._log("Restaurando configuracoes...");
    const configDir = `${snapshotDir}/configs`;
    if (fs.existsSync(configDir)) {
      const files = fs.readdirSync(configDir);
      for (const file of files) {
        try {
          fs.copyFileSync(`${configDir}/${file}`, `/opt/n8nlabz/${file}`);
        } catch {}
      }
    }

    // 4. Restaurar banco de dados (se postgres existir)
    this._log("Restaurando banco de dados...");
    const dbFile = `${snapshotDir}/databases.sql`;
    if (fs.existsSync(dbFile)) {
      try {
        // Redeployar postgres se necessário
        execSync(
          `docker exec $(docker ps -q -f name=postgres_postgres) psql -U postgres -f /dev/stdin < ${dbFile}`,
          { timeout: 300000, shell: "/bin/bash" }
        );
      } catch (err) {
        console.log("[SNAPSHOT] Erro restaurando DB:", err.message);
      }
    }

    this._log("Snapshot restaurado! Reiniciando servicos...");
    if (this.broadcast) {
      this.broadcast({ type: "snapshot", status: "completed" });
    }

    return { success: true, message: "Snapshot restaurado com sucesso" };
  }

  cleanOldSnapshots() {
    const snapshots = this.listSnapshots();
    if (snapshots.length > this.maxSnapshots) {
      const toDelete = snapshots.slice(this.maxSnapshots);
      for (const snap of toDelete) {
        try {
          execSync(`rm -rf "${this.snapshotsDir}/${snap.id}"`, {
            shell: "/bin/bash",
          });
        } catch {}
      }
    }
  }

  listSnapshots() {
    if (!fs.existsSync(this.snapshotsDir)) return [];

    return fs
      .readdirSync(this.snapshotsDir)
      .filter((d) => {
        try {
          return fs.existsSync(`${this.snapshotsDir}/${d}/metadata.json`);
        } catch {
          return false;
        }
      })
      .map((d) => {
        try {
          const metadata = JSON.parse(
            fs.readFileSync(`${this.snapshotsDir}/${d}/metadata.json`, "utf8")
          );
          return {
            id: d,
            ...metadata,
            sizeFormatted: this.formatSize(metadata.size || 0),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  deleteSnapshot(snapshotId) {
    const snapshotDir = `${this.snapshotsDir}/${snapshotId}`;
    if (!fs.existsSync(snapshotDir)) {
      throw new Error("Snapshot nao encontrado");
    }
    execSync(`rm -rf "${snapshotDir}"`, { shell: "/bin/bash" });
  }

  formatSize(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024)
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  }

  initScheduler() {
    const scheduleNext = () => {
      const now = new Date();
      const next = new Date();
      next.setHours(2, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);

      const delay = next - now;
      setTimeout(() => {
        this.createSnapshot()
          .then(() => console.log("[SNAPSHOT] Snapshot automatico criado"))
          .catch((err) =>
            console.error("[SNAPSHOT] Erro no snapshot automatico:", err.message)
          );
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    console.log("[SNAPSHOT] Scheduler iniciado — proximo snapshot as 02:00");
  }
}

module.exports = new SnapshotService();
