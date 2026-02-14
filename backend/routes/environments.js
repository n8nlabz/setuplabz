const express = require("express");
const router = express.Router();
const EnvironmentService = require("../services/environments");

router.get("/", (req, res) => {
  try {
    res.json({ environments: EnvironmentService.getEnvironmentStatus() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, tools } = req.body;
    if (!name) return res.status(400).json({ error: "Nome do ambiente é obrigatório" });

    const onLog = (text, type) => {
      if (req.app.locals.broadcast) {
        req.app.locals.broadcast({
          type: "environment",
          text,
          logType: type,
          time: new Date().toLocaleTimeString("pt-BR", { hour12: false }).slice(0, 8),
        });
      }
    };

    const result = await EnvironmentService.createEnvironment(name, tools, onLog);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:name", async (req, res) => {
  try {
    const onLog = (text, type) => {
      if (req.app.locals.broadcast) {
        req.app.locals.broadcast({ type: "environment", text, logType: type });
      }
    };
    const result = await EnvironmentService.destroyEnvironment(req.params.name, onLog);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
