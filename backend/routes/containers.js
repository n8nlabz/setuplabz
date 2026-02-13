const express = require("express");
const router = express.Router();
const DockerService = require("../services/docker");

router.get("/", (req, res) => {
  try {
    const containers = DockerService.listContainers();
    const stats = DockerService.getAllStats();
    const merged = containers.map((c) => {
      const s = stats.find((st) => st.id === c.id || st.name === c.name || st.name === `/${c.name}`);
      return { ...c, cpu: s?.cpu || "—", ram: s?.ram || "—", ramPerc: s?.ramPerc || "—", net: s?.net || "—" };
    });
    res.json({ containers: merged });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/:id/stats", (req, res) => {
  try { res.json(DockerService.getContainerStats(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/:id/logs", (req, res) => {
  try { res.json({ logs: DockerService.getContainerLogs(req.params.id, parseInt(req.query.lines) || 100) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/:id/start", (req, res) => {
  try { DockerService.startContainer(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/:id/stop", (req, res) => {
  try { DockerService.stopContainer(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/:id/restart", (req, res) => {
  try { DockerService.restartContainer(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
