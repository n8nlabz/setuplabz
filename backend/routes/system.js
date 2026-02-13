const express = require("express");
const router = express.Router();
const DockerService = require("../services/docker");

router.get("/info", (req, res) => {
  try {
    const info = DockerService.getSystemInfo();
    const containers = DockerService.listContainers();
    res.json({
      ...info,
      containers_total: containers.length,
      containers_running: containers.filter((c) => c.state === "running").length,
      swarm_active: DockerService.isSwarmActive(),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
