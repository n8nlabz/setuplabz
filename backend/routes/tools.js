const express = require("express");
const router = express.Router();
const InstallService = require("../services/install");

router.post("/:toolId/update-image", async (req, res) => {
  try {
    const { version } = req.body;
    if (!version) return res.status(400).json({ error: "Versão não informada" });

    const onLog = (text, type) => {
      if (req.app.locals.broadcast) {
        req.app.locals.broadcast({
          type: "update_image",
          toolId: req.params.toolId,
          text,
          logType: type,
          time: new Date().toLocaleTimeString("pt-BR", { hour12: false }).slice(0, 8),
        });
      }
    };

    const results = await InstallService.updateImage(req.params.toolId, version, onLog);
    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
