const express = require("express");
const router = express.Router();
const multer = require("multer");
const BackupService = require("../services/backup");

const upload = multer({ dest: "/tmp/n8nlabz-uploads/", limits: { fileSize: 100 * 1024 * 1024 } });

router.get("/", (req, res) => {
  try { res.json({ backups: BackupService.listBackups() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/create", async (req, res) => {
  try { res.json(await BackupService.createBackup()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/restore", upload.single("backup"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
  try { res.json(await BackupService.restoreBackup(req.file.path)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/download/:filename", (req, res) => {
  try {
    const backups = BackupService.listBackups();
    const b = backups.find((x) => x.filename === req.params.filename);
    if (!b) return res.status(404).json({ error: "Não encontrado" });
    res.download(BackupService.getBackupPath(b.filename), b.filename);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/:filename", (req, res) => {
  try { res.json(BackupService.deleteBackup(req.params.filename)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
