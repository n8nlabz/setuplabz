const { execSync, exec } = require("child_process");
const fs = require("fs");

class DockerService {
  static run(command, options = {}) {
    try {
      return execSync(command, {
        encoding: "utf-8",
        timeout: options.timeout || 120000,
        ...options,
      }).trim();
    } catch (err) {
      throw new Error(`Comando falhou: ${err.stderr || err.message}`);
    }
  }

  static async runAsync(command) {
    return new Promise((resolve, reject) => {
      exec(command, { encoding: "utf-8", timeout: 300000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout.trim());
      });
    });
  }

  static isDockerAvailable() {
    try {
      this.run("docker info > /dev/null 2>&1");
      return true;
    } catch {
      return false;
    }
  }

  static isSwarmActive() {
    try {
      const r = this.run("docker info --format '{{.Swarm.LocalNodeState}}'");
      return r.replace(/'/g, "") === "active";
    } catch {
      return false;
    }
  }

  static listContainers() {
    try {
      const fmt = '{{.ID}}|{{.Names}}|{{.Status}}|{{.Image}}|{{.Ports}}|{{.State}}|{{.CreatedAt}}';
      const output = this.run(`docker ps -a --format '${fmt}'`);
      if (!output) return [];

      return output.split("\n").filter(Boolean).map((line) => {
        const [id, name, status, image, ports, state, created] = line.split("|");
        return {
          id: id.trim(),
          name: name.trim(),
          status: status.trim(),
          image: image.trim(),
          ports: ports.trim(),
          state: state.trim(),
          created: created.trim(),
          tool: this.detectTool(name),
        };
      });
    } catch {
      return [];
    }
  }

  static getAllStats() {
    try {
      const fmt = '{{.ID}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}';
      const output = this.run(`docker stats --no-stream --format '${fmt}'`, { timeout: 30000 });
      if (!output) return [];

      return output.split("\n").filter(Boolean).map((line) => {
        const [id, name, cpu, ram, ramPerc, net] = line.split("|");
        return {
          id: id.trim(),
          name: name.trim().replace(/^\//, ""),
          cpu: cpu.trim(),
          ram: ram.trim(),
          ramPerc: ramPerc.trim(),
          net: net.trim(),
        };
      });
    } catch {
      return [];
    }
  }

  static getContainerStats(containerId) {
    try {
      const fmt = '{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}';
      const output = this.run(`docker stats ${containerId} --no-stream --format '${fmt}'`, { timeout: 15000 });
      const [cpu, ram, ramPerc, net, block] = output.split("|");
      return { cpu: cpu.trim(), ram: ram.trim(), ramPerc: ramPerc.trim(), net: net.trim(), block: block.trim() };
    } catch {
      return { cpu: "—", ram: "—", ramPerc: "—", net: "—", block: "—" };
    }
  }

  static startContainer(id) { return this.run(`docker start ${id}`); }
  static stopContainer(id) { return this.run(`docker stop ${id}`); }
  static restartContainer(id) { return this.run(`docker restart ${id}`); }

  static getContainerLogs(id, lines = 100) {
    try {
      return this.run(`docker logs --tail ${lines} ${id} 2>&1`);
    } catch (e) {
      return e.message;
    }
  }

  static async deployStack(stackName, composeContent) {
    const composePath = `/tmp/${stackName}-compose.yml`;
    fs.writeFileSync(composePath, composeContent);
    try {
      if (this.isSwarmActive()) {
        await this.runAsync(`docker stack deploy -c ${composePath} ${stackName}`);
      } else {
        await this.runAsync(`docker compose -f ${composePath} -p ${stackName} up -d`);
      }
      return { success: true };
    } finally {
      try { fs.unlinkSync(composePath); } catch {}
    }
  }

  static async removeStack(stackName) {
    if (this.isSwarmActive()) {
      await this.runAsync(`docker stack rm ${stackName}`);
    } else {
      await this.runAsync(`docker compose -p ${stackName} down -v`);
    }
    return { success: true };
  }

  static execInContainer(id, command) {
    return this.run(`docker exec ${id} sh -c '${command}'`);
  }

  static copyToContainer(id, src, dest) {
    return this.run(`docker cp ${src} ${id}:${dest}`);
  }

  static copyFromContainer(id, src, dest) {
    return this.run(`docker cp ${id}:${src} ${dest}`);
  }

  static detectTool(name) {
    const n = name.toLowerCase();
    if (n.includes("n8nlabz_panel")) return "panel";
    if (n.includes("n8n") && !n.includes("postgres") && !n.includes("redis")) return "n8n";
    if (n.includes("evolution")) return "evolution";
    if (n.includes("traefik")) return "traefik";
    if (n.includes("portainer")) return "portainer";
    if (n.includes("postgres")) return "postgres";
    if (n.includes("redis")) return "redis";
    if (n.includes("firecrawl")) return "firecrawl";
    return "other";
  }

  static getSystemInfo() {
    const safe = (cmd, fallback = "—") => {
      try { return this.run(cmd); } catch { return fallback; }
    };
    return {
      docker_version: safe("docker version --format '{{.Server.Version}}'"),
      os: safe("cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'\"' -f2"),
      cpu_count: parseInt(safe("nproc", "1")),
      ram_total_mb: parseInt(safe("free -m | awk '/Mem:/ {print $2}'", "0")),
      ram_used_mb: parseInt(safe("free -m | awk '/Mem:/ {print $3}'", "0")),
      disk_total: safe("df -h / | awk 'NR==2 {print $2}'"),
      disk_used: safe("df -h / | awk 'NR==2 {print $3}'"),
      disk_percentage: safe("df -h / | awk 'NR==2 {print $5}'"),
      uptime: safe("uptime -p"),
      hostname: safe("hostname"),
      ip: safe("curl -s --max-time 5 ifconfig.me || hostname -I | awk '{print $1}'"),
    };
  }

  static ensureNetwork(name, driver = "overlay") {
    try {
      const nets = this.run("docker network ls --format '{{.Name}}'");
      if (!nets.split("\n").includes(name)) {
        const flags = driver === "overlay" ? "--driver overlay --attachable" : `--driver ${driver}`;
        this.run(`docker network create ${flags} ${name}`);
      }
    } catch {}
  }
}

module.exports = DockerService;
