const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const expressWs = require("express-ws");

const { authMiddleware } = require("./middleware/auth");
const installRoutes = require("./routes/install");
const containersRoutes = require("./routes/containers");
const backupRoutes = require("./routes/backup");
const authRoutes = require("./routes/auth");
const systemRoutes = require("./routes/system");

const app = express();
expressWs(app);

const PORT = process.env.PORT || 3080;

// Security
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Muitas requisições. Tente novamente em 15 minutos." },
});
app.use("/api/", limiter);

// Public routes
app.use("/api/auth", authRoutes);

// Protected routes
app.use("/api/install", authMiddleware, installRoutes);
app.use("/api/containers", authMiddleware, containersRoutes);
app.use("/api/backup", authMiddleware, backupRoutes);
app.use("/api/system", authMiddleware, systemRoutes);

// WebSocket for real-time logs
app.ws("/api/ws/logs", (ws, req) => {
  ws.on("message", (msg) => {
    // Client can send commands via WS
  });
  ws.on("close", () => {});
});

// Serve frontend
const frontendPath = path.join(__dirname, "../frontend/dist");
app.use(express.static(frontendPath));
app.get("*", (req, res) => {
  const indexPath = path.join(frontendPath, "index.html");
  const fs = require("fs");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      name: "N8N LABZ Setup Panel API",
      version: "1.0.0",
      status: "running",
      docs: "Frontend not built. Run: npm run build:frontend",
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(err.status || 500).json({ error: err.message || "Erro interno" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("  ╔══════════════════════════════════════════╗");
  console.log("  ║     🚀 N8N LABZ Setup Panel v1.0        ║");
  console.log(`  ║     Porta: ${PORT}                          ║`);
  console.log("  ╚══════════════════════════════════════════╝");
  console.log("");
});

module.exports = app;
