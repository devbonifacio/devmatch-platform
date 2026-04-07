import express from 'express';
import User from '../models/User.js';
import protect from '../middleware/auth.js';

const router = express.Router();

// PUT /api/users/profile — update my profile
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, bio, github, stack, lookingFor, avatar } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { name, bio, github, stack, lookingFor, avatar },
      { new: true, runValidators: true }
    );

    res.json({ user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update profile.' });
  }
});

// GET /api/users/discover — get devs to swipe on
// Excludes: myself, already liked, already skipped
router.get('/discover', protect, async (req, res) => {
  try {
    const me = await User.findById(req.user._id);

    // Build exclusion list: myself + liked + skipped
    const excludeIds = [me._id, ...me.liked, ...me.skipped];

    const devs = await User.find({
      _id: { $nin: excludeIds },
    })
      .select('-password')
      .limit(20); // Get 20 devs at a time

      res.json({ users: devs });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch developers.' });
  }
});

// GET /api/users/:id — get a user's public profile
router.get('/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch user.' });
  }
});

export default router;