import express from 'express';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import protect from '../middleware/auth.js';

const router = express.Router();

// ── Validation rules for profile update ───────────────────────────────────
// Allows letters, emoji (including ZWJ sequences and skin-tone modifiers), spaces, hyphens, apostrophes, dots
const NAME_RE = new RegExp('^[\\p{L}\\p{M}\\p{Extended_Pictographic}\\u200D\\uFE0F\\s\\-\'.]+$', 'u');

const profileValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Name cannot exceed 50 characters.')
    .matches(NAME_RE).withMessage('Name contains invalid characters.'),
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 300 }).withMessage('Bio cannot exceed 300 characters.'),
  body('github')
    .optional()
    .trim()
    .custom((val) => {
      if (!val) return true;
      try {
        const url = new URL(val);
        return url.protocol === 'https:' && url.hostname === 'github.com';
      } catch { return false; }
    }).withMessage('GitHub must be a valid https://github.com URL.'),
  body('avatar')
    .optional()
    .trim()
    .custom((val) => {
      if (!val) return true;
      if (val.startsWith('data:image/')) return true; // base64 data URI from client canvas
      try {
        const url = new URL(val);
        return ['http:', 'https:'].includes(url.protocol);
      } catch { return false; }
    }).withMessage('Avatar must be a valid image URL or data URI.'),
  body('stack')
    .optional()
    .isArray({ max: 20 }).withMessage('Stack cannot exceed 20 items.'),
  body('stack.*')
    .optional()
    .trim()
    .isString()
    .isLength({ max: 50 }),
  body('lookingFor')
    .optional()
    .isArray(),
  body('lookingFor.*')
    .optional()
    .isIn(['open-source', 'startup', 'freelance', 'learning', 'hackathon'])
    .withMessage('Invalid lookingFor value.'),
];

// ── PUT /api/users/profile ─────────────────────────────────────────────────
router.put('/profile', protect, profileValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  try {
    // Whitelist allowed fields — reject any extra keys from the body
    const { name, bio, github, stack, lookingFor, avatar } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { name, bio, github, stack, lookingFor, avatar },
      { new: true, runValidators: true }
    ).select('-password -liked -skipped');

    return res.json({ user: updatedUser });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to update profile.' });
  }
});

// ── GET /api/users/search?q= ───────────────────────────────────────────────
router.get('/search', protect, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json({ users: [] });

  try {
    const me = await User.findById(req.user._id).select('blocked').lean();
    const blockedIds = me.blocked || [];

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({
      _id: { $ne: req.user._id, $nin: blockedIds },
      name: regex,
    })
      .select('-password -liked -skipped -blocked -friends -friendRequestsSent -friendRequestsReceived')
      .limit(20)
      .lean();

    return res.json({ users });
  } catch (err) {
    return res.status(500).json({ message: 'Search failed.' });
  }
});

// ── POST /api/users/block/:targetId ───────────────────────────────────────
router.post('/block/:targetId', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.targetId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }
  try {
    const myId     = req.user._id.toString();
    const targetId = req.params.targetId;

    if (myId === targetId) return res.status(400).json({ message: 'Cannot block yourself.' });

    await User.findByIdAndUpdate(myId, {
      $addToSet: { blocked: targetId },
      $pull:     { friends: targetId, friendRequestsSent: targetId, friendRequestsReceived: targetId },
    });
    await User.findByIdAndUpdate(targetId, {
      $pull: { friends: myId, friendRequestsSent: myId, friendRequestsReceived: myId },
    });

    return res.json({ blocked: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to block user.' });
  }
});

// ── DELETE /api/users/block/:targetId ─────────────────────────────────────
router.delete('/block/:targetId', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.targetId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { blocked: req.params.targetId },
    });
    return res.json({ unblocked: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to unblock user.' });
  }
});

// ── GET /api/users/discover ────────────────────────────────────────────────
router.get('/discover', protect, async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select('liked skipped blocked').lean();
    const excludeIds = [
      req.user._id,
      ...(me.liked    || []),
      ...(me.skipped  || []),
      ...(me.blocked  || []),
    ];

    const devs = await User.find({ _id: { $nin: excludeIds } })
      .select('-password -liked -skipped -blocked -friends -friendRequestsSent -friendRequestsReceived')
      .limit(20);

    return res.json({ users: devs });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch developers.' });
  }
});

// ── GET /api/users/:id ────────────────────────────────────────────────────
// MED-4 fixed: exclude liked/skipped arrays from public profiles.
router.get('/:id', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }
  try {
    const user = await User.findById(req.params.id)
      .select('-password -liked -skipped');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch user.' });
  }
});

export default router;