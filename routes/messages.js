import express from 'express';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import Message from '../models/Message.js';
import Match from '../models/Match.js';
import protect from '../middleware/auth.js';
import { rateLimitMessages } from '../middleware/rateLimit.js';

const router = express.Router();

// GET /api/messages/:matchId
router.get('/:matchId', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.matchId)) {
    return res.status(400).json({ message: 'Invalid match ID.' });
  }
  try {
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
      .sort({ createdAt: 1 });

    await Message.updateMany(
      { matchId: req.params.matchId, sender: { $ne: req.user._id }, read: false },
      { read: true }
    );

    return res.json({ messages });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch messages.' });
  }
});

// POST /api/messages/:matchId
router.post(
  '/:matchId',
  protect,
  rateLimitMessages,
  [
    body('text')
      .trim()
      .notEmpty().withMessage('Message cannot be empty.')
      .isLength({ max: 1000 }).withMessage('Message cannot exceed 1000 characters.'),
  ],
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.matchId)) {
      return res.status(400).json({ message: 'Invalid match ID.' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    try {
      const { text } = req.body;

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
      return res.status(201).json({ message });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to send message.' });
    }
  }
);

export default router;