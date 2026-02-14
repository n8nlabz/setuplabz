const express = require("express");
const router = express.Router();
const SnapshotService = require("../services/snapshot");

// GET /api/snapshots — list all snapshots
router.get("/", (req, res) => {
  try {
    const snapshots = SnapshotService.listSnapshots();
    res.json({ snapshots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/snapshots/create — create a new snapshot
router.post("/create", async (req, res) => {
  try {
    SnapshotService.broadcast = req.app.locals.broadcast;
    const metadata = await SnapshotService.createSnapshot();
    res.json({ success: true, snapshot: metadata });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/snapshots/restore/:id — restore a snapshot
router.post("/restore/:id", async (req, res) => {
  try {
    SnapshotService.broadcast = req.app.locals.broadcast;
    const result = await SnapshotService.restoreSnapshot(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/snapshots/:id — delete a snapshot
router.delete("/:id", (req, res) => {
  try {
    SnapshotService.deleteSnapshot(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
