import express from 'express';
import User from '../models/User.js';
import Match from '../models/Match.js';
import protect from '../middleware/auth.js';

const router = express.Router();

// POST /api/matches/like/:targetId — like a dev
router.post('/like/:targetId', protect, async (req, res) => {
  try {
    const me = await User.findById(req.user._id);
    const targetId = req.params.targetId;

    // Add target to my liked list (avoid duplicates with $addToSet)
    await User.findByIdAndUpdate(me._id, { $addToSet: { liked: targetId } });

    // Check if target has already liked me — if yes, it's a MATCH!
    const target = await User.findById(targetId);
    const isMatch = target.liked.includes(me._id);

    if (isMatch) {
      // Sort IDs so the pair is always in the same order (prevents duplicate matches)
      const sortedIds = [me._id.toString(), targetId].sort();

      // Create match document (upsert to prevent duplicates)
      const match = await Match.findOneAndUpdate(
        { users: sortedIds },
        { users: sortedIds },
        { upsert: true, new: true }
      ).populate('users', 'name avatar bio stack github');

      return res.json({ matched: true, match });
    }

    res.json({ matched: false });
  } catch (error) {
    res.status(500).json({ message: 'Failed to process like.' });
  }
});

// POST /api/matches/skip/:targetId — skip a dev
router.post('/skip/:targetId', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { skipped: req.params.targetId },
    });
    res.json({ skipped: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to skip.' });
  }
});

// GET /api/matches — get all my matches
router.get('/', protect, async (req, res) => {
  try {
    // Find all matches that include my ID
    const matches = await Match.find({ users: req.user._id }).populate(
      'users',
      'name avatar bio stack github isOnline lastSeen'
    );

    // For each match, return the OTHER user's info (not mine)
    const formattedMatches = matches.map((match) => {
      const otherUser = match.users.find(
        (u) => u._id.toString() !== req.user._id.toString()
      );
      return {
        matchId: match._id,
        user: otherUser,
        createdAt: match.createdAt,
      };
    });

    res.json({ matches: formattedMatches });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch matches.' });
  }
});

export default router;