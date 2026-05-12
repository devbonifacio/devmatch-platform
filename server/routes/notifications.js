import express from 'express';
import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import protect from '../middleware/auth.js';

const router = express.Router();

// ── GET /api/notifications ────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .populate('sender', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = notifications.filter((n) => !n.read).length;

    return res.json({ notifications, unreadCount });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch notifications.' });
  }
});

// ── PUT /api/notifications/read-all ───────────────────────────────────────
router.put('/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, read: false }, { read: true });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to mark notifications as read.' });
  }
});

// ── PUT /api/notifications/:id/read ───────────────────────────────────────
router.put('/:id/read', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid notification ID.' });
  }
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { read: true }
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to mark notification.' });
  }
});

// ── DELETE /api/notifications/:id ─────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid notification ID.' });
  }
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user._id });
    return res.json({ deleted: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete notification.' });
  }
});

export default router;
