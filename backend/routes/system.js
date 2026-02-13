const express = require("express");
const router = express.Router();
const fs = require("fs");
const DockerService = require("../services/docker");

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
      email_ssl: config.email_ssl || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
