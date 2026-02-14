const express = require("express");
const router = express.Router();
const fs = require("fs");
const DockerService = require("../services/docker");
const MetricsService = require("../services/metrics");

const CONFIG_PATH = "/opt/n8nlabz/config.json";

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {}
  return {};
}

router.get("/info", (req, res) => {
  try {
    const info = DockerService.getSystemInfo();
    const containers = DockerService.listContainers();
    const config = loadConfig();
    res.json({
      ...info,
      containers_total: containers.length,
      containers_running: containers.filter((c) => c.state === "running").length,
      swarm_active: DockerService.isSwarmActive(),
      domain_base: config.domain_base || null,
      email_ssl: config.admin_email || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/metrics", (req, res) => {
  try {
    res.json(MetricsService.getMetrics());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/cleanup", (req, res) => {
  try {
    const { type } = req.body;
    let result = "";

    switch (type) {
      case "images":
        result = DockerService.run("docker image prune -f 2>&1", { timeout: 60000 });
        break;
      case "containers":
        result = DockerService.run("docker container prune -f 2>&1", { timeout: 60000 });
        break;
      case "volumes":
        result = DockerService.run("docker volume prune -f 2>&1", { timeout: 60000 });
        break;
      case "build":
        result = DockerService.run("docker builder prune -f 2>&1", { timeout: 60000 });
        break;
      case "all":
        result = DockerService.run("docker system prune -f 2>&1", { timeout: 120000 });
        break;
      default:
        return res.status(400).json({ error: "Tipo de limpeza inválido" });
    }

    // Parse reclaimed space from output
    const spaceMatch = result.match(/reclaimed\s+space:\s+([\d.]+\s*\w+)/i) ||
                       result.match(/Total reclaimed space:\s+([\d.]+\s*\w+)/i);
    const spaceFreed = spaceMatch ? spaceMatch[1] : "0B";

    res.json({ success: true, output: result, spaceFreed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/cleanup/info", (req, res) => {
  try {
    const images = DockerService.run("docker images -f 'dangling=true' --format '{{.Size}}' 2>/dev/null | wc -l");
    const containers = DockerService.run("docker ps -a -f 'status=exited' --format '{{.ID}}' 2>/dev/null | wc -l");
    const volumes = DockerService.run("docker volume ls -f 'dangling=true' --format '{{.Name}}' 2>/dev/null | wc -l");

    res.json({
      dangling_images: parseInt(images) || 0,
      stopped_containers: parseInt(containers) || 0,
      dangling_volumes: parseInt(volumes) || 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
