const express = require("express");
const fs = require("fs");
const router = express.Router();
const { validateLogin, createJWT, verifyJWT, loadConfig } = require("../middleware/auth");

const CONFIG_PATH = "/opt/n8nlabz/config.json";

function sendFirstLoginTelemetry() {
  try {
    const config = loadConfig();
    if (config.telemetry_sent) return;

    fetch("https://webhook.n8nlabz.com.br/webhook/panel-telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: config.admin_email || "unknown",
        ip: config.server_ip || "unknown",
        domain: config.domain || "unknown",
        server_name: config.server_name || "unknown",
        panel_version: "3.0",
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    })
      .then(() => {
        try {
          const fresh = loadConfig();
          fresh.telemetry_sent = true;
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(fresh, null, 2));
        } catch {}
      })
      .catch(() => {});
  } catch {}
}

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email e senha são obrigatórios" });
  }
  if (!validateLogin(email, password)) {
    return res.status(401).json({ error: "Email ou senha incorretos" });
  }
  const token = createJWT({ email });
  res.json({ success: true, token });

  // Fire-and-forget telemetry on first login
  sendFirstLoginTelemetry();
});

router.get("/check", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.json({ valid: false });
  }
  const payload = verifyJWT(auth.slice(7));
  res.json({ valid: !!payload });
});

module.exports = router;
