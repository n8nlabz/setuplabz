const DockerService = require("./docker");
const fs = require("fs");
const path = require("path");

const BACKUP_DIR = "/opt/n8nlabz/backups";

class BackupService {
  static ensureDir() {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  static findN8nContainer() {
    const containers = DockerService.listContainers();
    return containers.find((c) => {
      const n = c.name.toLowerCase();
      return n.includes("n8n") && (n.includes("editor") || (!n.includes("postgres") && !n.includes("redis") && !n.includes("worker") && !n.includes("webhook"))) && c.state === "running";
    });
  }

  static async createBackup() {
    this.ensureDir();
    const container = this.findN8nContainer();
    if (!container) throw new Error("Container n8n não encontrado ou parado");

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `backup-${ts}.tar.gz`;
    const backupPath = path.join(BACKUP_DIR, filename);

    try {
      DockerService.execInContainer(container.id, "mkdir -p /home/node/backup/workflows /home/node/backup/credentials");
      DockerService.execInContainer(container.id, "n8n export:workflow --backup --output=/home/node/backup/workflows");
      DockerService.execInContainer(container.id, "n8n export:credentials --backup --decrypted --output=/home/node/backup/credentials");
      DockerService.execInContainer(container.id, "tar -czf /home/node/backup.tar.gz -C /home/node/backup workflows credentials");
      DockerService.copyFromContainer(container.id, "/home/node/backup.tar.gz", backupPath);
      DockerService.execInContainer(container.id, "rm -rf /home/node/backup /home/node/backup.tar.gz");

      const stats = fs.statSync(backupPath);
      return {
        success: true,
        filename,
        size: stats.size,
        sizeFormatted: this.fmtBytes(stats.size),
        date: new Date().toISOString(),
      };
    } catch (err) {
      throw new Error(`Erro ao criar backup: ${err.message}`);
    }
  }

  static async restoreBackup(filePath) {
    const container = this.findN8nContainer();
    if (!container) throw new Error("Container n8n não encontrado ou parado");

    try {
      DockerService.copyToContainer(container.id, filePath, "/home/node/backup.tar.gz");
      DockerService.execInContainer(container.id, "mkdir -p /home/node/backup && tar -xzf /home/node/backup.tar.gz -C /home/node/backup");

      // Import workflows one by one
      const files = DockerService.execInContainer(container.id, "ls /home/node/backup/workflows/ 2>/dev/null").trim().split("\n").filter(Boolean);
      for (const f of files) {
        try {
          DockerService.execInContainer(container.id, `n8n import:workflow --input=/home/node/backup/workflows/${f}`);
        } catch {}
      }

      // Import credentials as array
      DockerService.execInContainer(container.id, 
        `cd /home/node/backup/credentials && echo "[" > /tmp/creds.json && first=true && for f in *.json; do if [ "$first" = true ]; then first=false; else echo "," >> /tmp/creds.json; fi; cat "$f" >> /tmp/creds.json; done && echo "]" >> /tmp/creds.json && n8n import:credentials --input=/tmp/creds.json`
      );

      DockerService.execInContainer(container.id, "rm -rf /home/node/backup /home/node/backup.tar.gz /tmp/creds.json");
      DockerService.restartContainer(container.id);

      return { success: true, workflows: files.length, message: "Backup restaurado!" };
    } catch (err) {
      throw new Error(`Erro ao restaurar: ${err.message}`);
    }
  }

  static listBackups() {
    this.ensureDir();
    try {
      return fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".tar.gz")).sort().reverse().map((filename) => {
        const fp = path.join(BACKUP_DIR, filename);
        const stats = fs.statSync(fp);
        return {
          filename,
          size: stats.size,
          sizeFormatted: this.fmtBytes(stats.size),
          date: stats.mtime.toISOString(),
        };
      });
    } catch { return []; }
  }

  static deleteBackup(filename) {
    const fp = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(fp)) throw new Error("Backup não encontrado");
    fs.unlinkSync(fp);
    return { success: true };
  }

  static getBackupPath(filename) {
    return path.join(BACKUP_DIR, filename);
  }

  static fmtBytes(b) {
    if (b === 0) return "0 B";
    const k = 1024;
    const s = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i];
  }
}

module.exports = BackupService;
