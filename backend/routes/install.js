const express = require("express");
const router = express.Router();
const InstallService = require("../services/install");

router.get("/status", (req, res) => {
  try { res.json({ installed: InstallService.getInstalledTools() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/:toolId", async (req, res) => {
  try {
    const result = await InstallService.installTool(req.params.toolId, req.body, null);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/:toolId", async (req, res) => {
  try {
    const result = await InstallService.uninstallTool(req.params.toolId);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
