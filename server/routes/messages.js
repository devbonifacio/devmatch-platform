import express from 'express';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import Message from '../models/Message.js';
import Match from '../models/Match.js';
import protect from '../middleware/auth.js';
import { rateLimitMessages } from '../middleware/rateLimit.js';
import { emitToUser } from '../socket/index.js';

export default function createMessageRouter(io) {
  const router = express.Router();

  async function checkParticipant(matchId, userId) {
    const match = await Match.findById(matchId);
    if (!match) return null;
    return match.users.some((u) => u.toString() === userId.toString()) ? match : null;
  }

  // GET /api/messages/:matchId
  router.get('/:matchId', protect, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.matchId)) {
      return res.status(400).json({ message: 'Invalid match ID.' });
    }
    try {
      const match = await checkParticipant(req.params.matchId, req.user._id);
      if (!match) return res.status(403).json({ message: 'Not authorized.' });

      const messages = await Message.find({ matchId: req.params.matchId })
        .populate('sender', 'name avatar')
        .sort({ createdAt: 1 });

      await Message.updateMany(
        { matchId: req.params.matchId, sender: { $ne: req.user._id }, read: false },
        { read: true }
      );

      const myId = req.user._id.toString();
      const processed = messages.map((msg) => {
        const m = msg.toObject();
        // For viewOnce images received (not sent by me): strip data once viewed
        if (m.viewOnce && m.image && m.sender._id.toString() !== myId) {
          const viewed = (m.viewedBy || []).some((v) => v.toString() === myId);
          m.viewOnceViewed = viewed;
          if (viewed) m.image = ''; // strip image data — already viewed
        }
        return m;
      });

      return res.json({ messages: processed });
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
        .optional({ nullable: true, checkFalsy: false })
        .trim()
        .isLength({ max: 1000 }).withMessage('Message cannot exceed 1000 characters.'),
      body('image')
        .optional({ nullable: true })
        .custom((val) => {
          if (!val) return true;
          if (!val.startsWith('data:image/')) throw new Error('Image must be a data URI.');
          if (val.length > 5 * 1024 * 1024) throw new Error('Image too large (max ~5 MB).');
          return true;
        }),
      body('audio')
        .optional({ nullable: true })
        .custom((val) => {
          if (!val) return true;
          if (!val.startsWith('data:audio/')) throw new Error('Audio must be a data URI.');
          if (val.length > 3 * 1024 * 1024) throw new Error('Audio too large (max ~3 MB).');
          return true;
        }),
      body('viewOnce').optional().isBoolean().toBoolean(),
    ],
    async (req, res) => {
      if (!mongoose.isValidObjectId(req.params.matchId)) {
        return res.status(400).json({ message: 'Invalid match ID.' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { text, image, audio, viewOnce } = req.body;
      if (!text && !image && !audio) {
        return res.status(400).json({ message: 'Message must have text, image, or audio.' });
      }

      try {
        const match = await checkParticipant(req.params.matchId, req.user._id);
        if (!match) return res.status(403).json({ message: 'Not authorized.' });

        const message = await Message.create({
          matchId: req.params.matchId,
          sender: req.user._id,
          text: text?.trim() || '',
          image: image || '',
          audio: audio || '',
          viewOnce: !!viewOnce,
        });

        await message.populate('sender', 'name avatar');
        const msgObj = message.toObject();
        const base = { ...msgObj, matchId: String(req.params.matchId) };

        match.users.forEach((uid) => {
          const isMe = uid.toString() === req.user._id.toString();
          // Receivers of viewOnce images get the image data too (they must tap to reveal it)
          // but we flag viewOnce so the client shows the overlay.
          // Once they call /view the server will strip it on next GET.
          const payload = (!isMe && viewOnce)
            ? { ...base, viewOnce: true, viewOnceViewed: false }
            : base;
          emitToUser(io, uid, 'chat:message', payload);
        });

        return res.status(201).json({ message: msgObj });
      } catch (error) {
        if (error.name === 'ValidationError') {
          return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to send message.' });
      }
    }
  );

  // POST /api/messages/:matchId/:messageId/view — mark viewOnce image as viewed by receiver
  router.post('/:matchId/:messageId/view', protect, async (req, res) => {
    const { matchId, messageId } = req.params;
    if (!mongoose.isValidObjectId(matchId) || !mongoose.isValidObjectId(messageId)) {
      return res.status(400).json({ message: 'Invalid ID.' });
    }
    try {
      const match = await checkParticipant(matchId, req.user._id);
      if (!match) return res.status(403).json({ message: 'Not authorized.' });

      const msg = await Message.findOne({ _id: messageId, matchId });
      if (!msg) return res.status(404).json({ message: 'Message not found.' });
      if (!msg.viewOnce) return res.status(400).json({ message: 'Not a view-once message.' });
      if (msg.sender.toString() === req.user._id.toString()) {
        return res.status(400).json({ message: 'Sender cannot mark their own message.' });
      }

      await Message.findByIdAndUpdate(msg._id, {
        $addToSet: { viewedBy: req.user._id },
      });

      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ message: 'Failed to record view.' });
    }
  });

  return router;
}
