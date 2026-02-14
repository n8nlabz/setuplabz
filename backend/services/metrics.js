const DockerService = require("./docker");
const fs = require("fs");

const METRICS_PATH = "/opt/n8nlabz/metrics.json";
const ENVIRONMENTS_PATH = "/opt/n8nlabz/environments.json";
const MAX_REALTIME_POINTS = 120; // 1h at 30s intervals
const MAX_DISK_DAYS = 30;

class MetricsService {
  static realtimeData = [];
  static collectInterval = null;

  static loadDiskHistory() {
    try {
      if (fs.existsSync(METRICS_PATH)) {
        return JSON.parse(fs.readFileSync(METRICS_PATH, "utf-8"));
      }
    } catch {}
    return { disk: [] };
  }

  static saveDiskHistory(data) {
    fs.writeFileSync(METRICS_PATH, JSON.stringify(data, null, 2));
  }

  static getEnvPrefixes() {
    try {
      if (fs.existsSync(ENVIRONMENTS_PATH)) {
        const envs = JSON.parse(fs.readFileSync(ENVIRONMENTS_PATH, "utf-8"));
        return (envs || []).map((e) => (e.name || "").toLowerCase() + "_");
      }
    } catch {}
    return [];
  }

  static collectRealtimeStats() {
    try {
      const info = DockerService.getSystemInfo();
      let cpuUsage = 0;

      try {
        const stats = DockerService.getAllStats();
        const envPrefixes = this.getEnvPrefixes();
        const cpuCount = info.cpu_count || parseInt(DockerService.run("nproc")) || 1;

        const filtered = stats.filter((s) => {
          const name = s.name.toLowerCase();
          // Exclude test environment containers
          if (envPrefixes.some((p) => name.startsWith(p))) return false;
          // Parse CPU value
          const cpuVal = parseFloat((s.cpu || "0").replace("%", ""));
          // Exclude containers with abnormal CPU (>99% = likely restart loop)
          if (cpuVal > 99) return false;
          return true;
        });

        const totalCpu = filtered.reduce((sum, s) => {
          return sum + parseFloat((s.cpu || "0").replace("%", ""));
        }, 0);

        // Docker stats CPU% is per-core, normalize to total system
        cpuUsage = Math.round(totalCpu / cpuCount);
        cpuUsage = Math.min(cpuUsage, 100);
      } catch {
        // Fallback: system top
        try {
          const cpuIdle = DockerService.run(
            "top -bn1 | grep 'Cpu(s)' | awk '{print $8}' 2>/dev/null || echo '0'"
          );
          cpuUsage = Math.round(100 - parseFloat(cpuIdle || "0"));
        } catch {
          cpuUsage = 0;
        }
      }

      const point = {
        time: new Date().toLocaleTimeString("pt-BR", { hour12: false }).slice(0, 5),
        timestamp: Date.now(),
        cpu: isNaN(cpuUsage) ? 0 : cpuUsage,
        ram: info.ram_total_mb > 0 ? Math.round((info.ram_used_mb / info.ram_total_mb) * 100) : 0,
        ram_used: info.ram_used_mb,
        ram_total: info.ram_total_mb,
      };

      this.realtimeData.push(point);
      if (this.realtimeData.length > MAX_REALTIME_POINTS) {
        this.realtimeData = this.realtimeData.slice(-MAX_REALTIME_POINTS);
      }

      return point;
    } catch {
      return null;
    }
  }

  static collectDiskStats() {
    try {
      const info = DockerService.getSystemInfo();
      const diskUsedRaw = DockerService.run("df / | awk 'NR==2 {print $3}'");
      const diskTotalRaw = DockerService.run("df / | awk 'NR==2 {print $2}'");

      const history = this.loadDiskHistory();
      history.disk.push({
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toISOString(),
        used: info.disk_used,
        total: info.disk_total,
        percentage: info.disk_percentage,
        used_bytes: parseInt(diskUsedRaw) * 1024 || 0,
        total_bytes: parseInt(diskTotalRaw) * 1024 || 0,
      });

      // Keep last 30 days
      if (history.disk.length > MAX_DISK_DAYS * 24) {
        history.disk = history.disk.slice(-(MAX_DISK_DAYS * 24));
      }

      this.saveDiskHistory(history);
    } catch {}
  }

  static getMetrics() {
    const history = this.loadDiskHistory();
    return {
      realtime: this.realtimeData,
      disk: history.disk || [],
    };
  }

  static startCollecting(broadcast) {
    // Collect realtime stats every 30 seconds
    this.collectInterval = setInterval(() => {
      const point = this.collectRealtimeStats();
      if (point && broadcast) {
        broadcast({ type: "metrics", point });
      }
    }, 30000);

    // Collect disk stats every hour
    setInterval(() => {
      this.collectDiskStats();
    }, 3600000);

    // Initial collection
    this.collectRealtimeStats();
    this.collectDiskStats();

    console.log("[METRICS] Coleta de metricas iniciada (30s CPU/RAM, 1h disco).");
  }
}

module.exports = MetricsService;
