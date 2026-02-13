const express = require("express");
const router = express.Router();
const { generateToken, loadTokens, revokeToken } = require("../middleware/auth");

router.post("/setup", (req, res) => {
  const tokens = loadTokens();
  if (tokens.length > 0) return res.status(403).json({ error: "Setup já realizado" });
  const token = generateToken(req.body.label || "admin");
  res.json({ success: true, token, message: "Guarde este token!" });
});

router.post("/token", (req, res) => {
  let tk = null;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) tk = auth.slice(7);
  if (!tk) tk = req.headers["x-api-key"];
  const tokens = loadTokens();
  if (tokens.length > 0 && !tokens.find((t) => t.token === tk && t.active)) {
    return res.status(403).json({ error: "Token inválido" });
  }
  const token = generateToken(req.body.label || "aluno");
  res.json({ success: true, token });
});

router.get("/tokens", (req, res) => {
  const tokens = loadTokens();
  res.json({
    tokens: tokens.map((t) => ({
      label: t.label,
      preview: `labz_...${t.token.slice(-8)}`,
      created_at: t.created_at,
      last_used: t.last_used,
      active: t.active,
    })),
  });
});

router.get("/check", (req, res) => {
  let tk = null;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) tk = auth.slice(7);
  if (!tk) tk = req.headers["x-api-key"];
  const tokens = loadTokens();
  if (tokens.length === 0) return res.json({ valid: true, setup_required: true });
  if (!tk) return res.json({ valid: false });
  res.json({ valid: !!tokens.find((t) => t.token === tk && t.active), setup_required: false });
});

router.delete("/token/:token", (req, res) => {
  revokeToken(req.params.token) ? res.json({ success: true }) : res.status(404).json({ error: "Não encontrado" });
});

module.exports = router;
