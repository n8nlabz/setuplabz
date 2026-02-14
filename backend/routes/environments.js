const express = require("express");
const dns = require("dns").promises;
const fs = require("fs");
const router = express.Router();
const EnvironmentService = require("../services/environments");

const CONFIG_PATH = "/opt/n8nlabz/config.json";

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {}
  return {};
}

// POST /api/environments/verify-dns
router.post("/verify-dns", async (req, res) => {
  const { subdomains } = req.body;
  if (!subdomains || !Array.isArray(subdomains)) {
    return res.status(400).json({ error: "subdomains deve ser um array" });
  }

  const config = loadConfig();
  const serverIp = config.server_ip || "";

  const results = [];
  for (const sub of subdomains) {
    try {
      const addresses = await dns.resolve4(sub);
      const ok = addresses.includes(serverIp);
      results.push({ subdomain: sub, ok, resolved: addresses.join(", "), expected: serverIp });
    } catch {
      results.push({ subdomain: sub, ok: false, resolved: null, expected: serverIp, error: "DNS nao encontrado" });
    }
  }

  res.json({ results, allOk: results.every((r) => r.ok) });
});

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
