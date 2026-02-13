const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = "/opt/n8nlabz";
const TOKENS_PATH = path.join(DATA_DIR, "tokens.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadTokens() {
  ensureDir();
  try {
    if (fs.existsSync(TOKENS_PATH)) return JSON.parse(fs.readFileSync(TOKENS_PATH, "utf-8"));
  } catch {}
  return [];
}

function saveTokens(tokens) {
  ensureDir();
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

function generateToken(label = "default") {
  const token = `labz_${crypto.randomBytes(24).toString("hex")}`;
  const tokens = loadTokens();
  tokens.push({ token, label, created_at: new Date().toISOString(), last_used: null, active: true });
  saveTokens(tokens);
  return token;
}

function validateToken(token) {
  const tokens = loadTokens();
  const found = tokens.find((t) => t.token === token && t.active);
  if (found) {
    found.last_used = new Date().toISOString();
    saveTokens(tokens);
    return true;
  }
  return false;
}

function revokeToken(token) {
  const tokens = loadTokens();
  const found = tokens.find((t) => t.token === token);
  if (found) { found.active = false; saveTokens(tokens); return true; }
  return false;
}

function authMiddleware(req, res, next) {
  const tokens = loadTokens();
  // First setup: no tokens = allow
  if (tokens.length === 0) return next();

  let token = null;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) token = auth.slice(7);
  if (!token) token = req.headers["x-api-key"];
  if (!token) return res.status(401).json({ error: "Token não fornecido" });
  if (!validateToken(token)) return res.status(403).json({ error: "Token inválido" });
  next();
}

module.exports = { authMiddleware, generateToken, validateToken, revokeToken, loadTokens, saveTokens };
