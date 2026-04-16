import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Match from '../models/Match.js';
import protect from '../middleware/auth.js';
import { rateLimitLikes } from '../middleware/rateLimit.js';

const router = express.Router();

// POST /api/matches/like/:targetId — dar like com rate limit
router.post('/like/:targetId', protect, rateLimitLikes, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.targetId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }
  try {
    const myId     = req.user._id.toString();
    const targetId = req.params.targetId;

    if (myId === targetId) {
      return res.status(400).json({ message: 'Cannot like yourself.' });
    }

    // Impede likes duplicados
    const me = await User.findById(myId).select('liked');
    if (me.liked.some((id) => id.toString() === targetId)) {
      return res.status(400).json({ message: 'Já deste like a este utilizador.' });
    }

    // Regista o like
    await User.findByIdAndUpdate(myId, { $addToSet: { liked: targetId } });

    // Verifica se é match mútuo
    const target = await User.findById(targetId)
      .select('liked name avatar bio stack github')
      .lean();

    if (!target) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const isMatch = target.liked.some((id) => id.toString() === myId);

    if (isMatch) {
      const sortedIds = [myId, targetId].sort();
      let match = await Match.findOne({ users: { $all: sortedIds, $size: 2 } })
        .populate('users', 'name avatar bio stack github isOnline lastSeen');

      if (!match) {
        try {
          const created = await Match.create({ users: sortedIds });
          match = await Match.findById(created._id)
            .populate('users', 'name avatar bio stack github isOnline lastSeen');
        } catch (createErr) {
          if (createErr.code === 11000) {
            // Duplicate key — match was already created (race condition or stale unique index).
            // Fetch the existing match instead of failing.
            match = await Match.findOne({ users: { $all: sortedIds } })
              .populate('users', 'name avatar bio stack github isOnline lastSeen');
          } else {
            throw createErr;
          }
        }
      }

      return res.json({ matched: true, match });
    }

    return res.json({ matched: false });
  } catch (error) {
    console.error('Like error:', error);
    return res.status(500).json({ message: 'Failed to process like.', detail: error.message });
  }
});

// POST /api/matches/skip/:targetId — fazer skip
router.post('/skip/:targetId', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.targetId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { skipped: req.params.targetId },
    });
    return res.json({ skipped: true });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to skip.' });
  }
});

// GET /api/matches — listar todos os matches do utilizador
router.get('/', protect, async (req, res) => {
  try {
    const matches = await Match.find({ users: req.user._id })
      .populate('users', 'name avatar bio stack github isOnline lastSeen')
      .sort({ updatedAt: -1 });

    // Inclui currentUserId para o frontend identificar qual é "o outro"
    const formatted = matches.map((m) => ({
      ...m.toObject(),
      currentUserId: req.user._id.toString(),
    }));

    return res.json({ matches: formatted });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch matches.' });
  }
});

export default router;
