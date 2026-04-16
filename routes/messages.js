import express from 'express';
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Match from '../models/Match.js';
import protect from '../middleware/auth.js';
import { rateLimitMessages } from '../middleware/rateLimit.js';

const router = express.Router();

// GET /api/messages/:matchId — get all messages for a match
router.get('/:matchId', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.matchId)) {
    return res.status(400).json({ message: 'Invalid match ID.' });
  }
  try {
    // Verify this user is part of the match
    const match = await Match.findById(req.params.matchId);
    if (!match) return res.status(404).json({ message: 'Match not found.' });

    const isParticipant = match.users.some(
      (u) => u.toString() === req.user._id.toString()
    );
    if (!isParticipant) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    const messages = await Message.find({ matchId: req.params.matchId })
      .populate('sender', 'name avatar')
      .sort({ createdAt: 1 }); // oldest first

    // Mark all unread messages from the other user as read
    await Message.updateMany(
      { matchId: req.params.matchId, sender: { $ne: req.user._id }, read: false },
      { read: true }
    );

    res.json({ messages });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch messages.' });
  }
});

// POST /api/messages/:matchId — send a message (fallback if socket fails)
router.post('/:matchId', protect, rateLimitMessages, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.matchId)) {
    return res.status(400).json({ message: 'Invalid match ID.' });
  }
  try {
    const { text } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ message: 'Message cannot be empty.' });
    }

    const match = await Match.findById(req.params.matchId);
    if (!match) return res.status(404).json({ message: 'Match not found.' });

    const isParticipant = match.users.some(
      (u) => u.toString() === req.user._id.toString()
    );
    if (!isParticipant) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    const message = await Message.create({
      matchId: req.params.matchId,
      sender: req.user._id,
      text: text.trim(),
    });

    await message.populate('sender', 'name avatar');
    res.status(201).json({ message });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send message.' });
  }
});

export default router;