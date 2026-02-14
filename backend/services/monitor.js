const DockerService = require("./docker");
const PushService = require("./push");
const fs = require("fs");

const CONFIG_PATH = "/opt/n8nlabz/config.json";
const BACKUP_PATH = "/opt/n8nlabz/backups";
const PREFS_PATH = "/opt/n8nlabz/notification-prefs.json";

class ServiceMonitor {
  constructor() {
    this.previousStatus = {};
    this.lastNotified = {};
    this.intervalIds = [];
  }

  // ─── Rate limiting ───
  canNotify(key, cooldownMs) {
    const now = Date.now();
    const last = this.lastNotified[key] || 0;
    if (now - last < cooldownMs) return false;
    this.lastNotified[key] = now;
    return true;
  }

  // ─── Preferences ───
  loadPrefs() {
    try {
      if (fs.existsSync(PREFS_PATH)) {
        return JSON.parse(fs.readFileSync(PREFS_PATH, "utf-8"));
      }
    } catch {}
    return { service_down: true, high_resource: true, backup_reminder: true, new_version: true };
  }

  static savePrefs(prefs) {
    try {
      fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2));
    } catch {}
  }

  static getPrefs() {
    try {
      if (fs.existsSync(PREFS_PATH)) {
        return JSON.parse(fs.readFileSync(PREFS_PATH, "utf-8"));
      }
    } catch {}
    return { service_down: true, high_resource: true, backup_reminder: true, new_version: true };
  }

  // ─── Service check ───
  checkServices() {
    const prefs = this.loadPrefs();
    if (!prefs.service_down) return;

    try {
      const containers = DockerService.listContainers();
      const toolPrefixes = ["n8n_", "evolution_", "portainer_"];
      const toolNames = { n8n_: "n8n", evolution_: "Evolution API", portainer_: "Portainer" };

      for (const prefix of toolPrefixes) {
        const toolContainers = containers.filter((c) => {
          const base = c.name.indexOf(".") > 0 ? c.name.slice(0, c.name.indexOf(".")) : c.name;
          return base.toLowerCase().startsWith(prefix);
        });

        if (toolContainers.length === 0) continue;

        const anyRunning = toolContainers.some((c) => c.state === "running");
        const prevState = this.previousStatus[prefix];
        const name = toolNames[prefix] || prefix;

        if (prevState === "running" && !anyRunning) {
          // Service went down — rate limit: 1 per 5 min per service
          if (this.canNotify("service-down-" + prefix, 5 * 60 * 1000)) {
            PushService.notifyServiceDown(name);
            console.log("[MONITOR] Servico caiu: " + name);
          }
        }

        this.previousStatus[prefix] = anyRunning ? "running" : "stopped";
      }
    } catch (err) {
      // Silently ignore errors
    }
  }

  // ─── Resource check ───
  checkResources() {
    const prefs = this.loadPrefs();
    if (!prefs.high_resource) return;

    try {
      const info = DockerService.getSystemInfo();

      // CPU check
      const cpuIdle = parseFloat(
        DockerService.run("top -bn1 | grep 'Cpu(s)' | awk '{print $8}' 2>/dev/null || echo '100'")
      );
      const cpuUsage = Math.round(100 - (isNaN(cpuIdle) ? 100 : cpuIdle));

      if (cpuUsage > 80 && this.canNotify("high-cpu", 60 * 60 * 1000)) {
        PushService.notifyHighResource("CPU", cpuUsage);
        console.log("[MONITOR] CPU alta: " + cpuUsage + "%");
      }

      // RAM check
      const ramPerc = info.ram_total_mb > 0
        ? Math.round((info.ram_used_mb / info.ram_total_mb) * 100)
        : 0;

      if (ramPerc > 80 && this.canNotify("high-ram", 60 * 60 * 1000)) {
        PushService.notifyHighResource("RAM", ramPerc);
        console.log("[MONITOR] RAM alta: " + ramPerc + "%");
      }

      // Disk check
      const diskPerc = parseInt(String(info.disk_percentage || "0").replace("%", ""));
      if (diskPerc > 90 && this.canNotify("high-disk", 60 * 60 * 1000)) {
        PushService.notifyHighResource("Disco", diskPerc);
        console.log("[MONITOR] Disco alto: " + diskPerc + "%");
      }
    } catch {}
  }

  // ─── Backup check ───
  checkBackup() {
    const prefs = this.loadPrefs();
    if (!prefs.backup_reminder) return;

    try {
      if (!fs.existsSync(BACKUP_PATH)) return;

      const files = fs.readdirSync(BACKUP_PATH)
        .filter((f) => f.endsWith(".tar.gz"))
        .sort()
        .reverse();

      if (files.length === 0) {
        // No backups at all — remind once per day
        if (this.canNotify("backup-reminder", 24 * 60 * 60 * 1000)) {
          PushService.notifyBackupReminder();
          console.log("[MONITOR] Nenhum backup encontrado, enviando lembrete.");
        }
        return;
      }

      // Check age of most recent backup
      const latestFile = files[0];
      const stat = fs.statSync(BACKUP_PATH + "/" + latestFile);
      const ageMs = Date.now() - stat.mtimeMs;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      if (ageDays > 7 && this.canNotify("backup-reminder", 24 * 60 * 60 * 1000)) {
        PushService.notifyBackupReminder();
        console.log("[MONITOR] Ultimo backup ha " + Math.round(ageDays) + " dias, enviando lembrete.");
      }
    } catch {}
  }

  // ─── Start monitoring ───
  start() {
    // Initialize previous status
    try {
      const containers = DockerService.listContainers();
      const prefixes = ["n8n_", "evolution_", "portainer_"];
      for (const prefix of prefixes) {
        const found = containers.filter((c) => {
          const base = c.name.indexOf(".") > 0 ? c.name.slice(0, c.name.indexOf(".")) : c.name;
          return base.toLowerCase().startsWith(prefix);
        });
        if (found.length > 0) {
          this.previousStatus[prefix] = found.some((c) => c.state === "running") ? "running" : "stopped";
        }
      }
    } catch {}

    // Service check every 30s
    this.intervalIds.push(setInterval(() => this.checkServices(), 30000));

    // Resource check every 60s
    this.intervalIds.push(setInterval(() => this.checkResources(), 60000));

    // Backup check every 1 hour
    this.intervalIds.push(setInterval(() => this.checkBackup(), 3600000));

    // Initial backup check after 10s
    setTimeout(() => this.checkBackup(), 10000);

    console.log("[MONITOR] Monitor de servicos iniciado (30s servicos, 60s recursos, 1h backup).");
  }
}

module.exports = ServiceMonitor;
