const express = require("express");
const router = express.Router();
const PushService = require("../services/push");
const ServiceMonitor = require("../services/monitor");

// GET /api/push/vapid-key — public VAPID key for frontend
router.get("/vapid-key", (req, res) => {
  const key = PushService.getVapidPublicKey();
  if (!key) {
    return res.status(500).json({ error: "VAPID key nao configurada" });
  }
  res.json({ publicKey: key });
});

// POST /api/push/subscribe — save push subscription
router.post("/subscribe", (req, res) => {
  if (!req.body || !req.body.endpoint) {
    return res.status(400).json({ error: "Subscription invalida" });
  }
  PushService.addSubscription(req.body);
  res.json({ success: true });
});

// DELETE /api/push/subscribe — remove push subscription
router.delete("/subscribe", (req, res) => {
  if (!req.body || !req.body.endpoint) {
    return res.status(400).json({ error: "Endpoint nao informado" });
  }
  PushService.removeSubscription(req.body.endpoint);
  res.json({ success: true });
});

// POST /api/push/test — send test notification
router.post("/test", async (req, res) => {
  try {
    await PushService.sendToAll({
      title: "Teste de notificacao",
      body: "Se voce esta vendo isso, as notificacoes estao funcionando!",
      tag: "test",
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/push/prefs — get notification preferences
router.get("/prefs", (req, res) => {
  res.json(ServiceMonitor.getPrefs());
});

// POST /api/push/prefs — save notification preferences
router.post("/prefs", (req, res) => {
  ServiceMonitor.savePrefs(req.body);
  res.json({ success: true });
});

module.exports = router;
