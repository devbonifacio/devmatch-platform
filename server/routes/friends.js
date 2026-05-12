import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import protect from '../middleware/auth.js';

const router = express.Router();

// ── POST /api/friends/request/:targetId ────────────────────────────────────
router.post('/request/:targetId', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.targetId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }
  try {
    const myId     = req.user._id.toString();
    const targetId = req.params.targetId;

    if (myId === targetId) {
      return res.status(400).json({ message: 'Cannot add yourself.' });
    }

    const [me, target] = await Promise.all([
      User.findById(myId).select('friends friendRequestsSent blocked'),
      User.findById(targetId).select('friends friendRequestsReceived blocked'),
    ]);

    if (!target) return res.status(404).json({ message: 'User not found.' });

    if (me.blocked.some((id) => id.toString() === targetId)) {
      return res.status(400).json({ message: 'You have blocked this user.' });
    }
    if (target.blocked.some((id) => id.toString() === myId)) {
      return res.status(400).json({ message: 'Cannot send request to this user.' });
    }
    if (me.friends.some((id) => id.toString() === targetId)) {
      return res.status(400).json({ message: 'Already friends.' });
    }
    if (me.friendRequestsSent.some((id) => id.toString() === targetId)) {
      return res.status(400).json({ message: 'Friend request already sent.' });
    }

    await User.findByIdAndUpdate(myId,     { $addToSet: { friendRequestsSent: targetId } });
    await User.findByIdAndUpdate(targetId, { $addToSet: { friendRequestsReceived: myId } });

    const notification = await Notification.create({
      recipient: targetId,
      sender: myId,
      type: 'friend_request',
      data: {},
    });

    const io = req.app.get('io');
    if (io) {
      const { emitToUser } = await import('../socket/index.js');
      const senderUser = await User.findById(myId).select('name avatar').lean();
      emitToUser(io, targetId, 'notification:new', {
        ...notification.toObject(),
        sender: senderUser,
      });
    }

    return res.json({ sent: true });
  } catch (err) {
    console.error('Friend request error:', err);
    return res.status(500).json({ message: 'Failed to send friend request.' });
  }
});

// ── POST /api/friends/accept/:senderId ─────────────────────────────────────
router.post('/accept/:senderId', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.senderId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }
  try {
    const myId     = req.user._id.toString();
    const senderId = req.params.senderId;

    const me = await User.findById(myId).select('friendRequestsReceived');
    if (!me.friendRequestsReceived.some((id) => id.toString() === senderId)) {
      return res.status(400).json({ message: 'No friend request from this user.' });
    }

    await User.findByIdAndUpdate(myId, {
      $pull:      { friendRequestsReceived: senderId },
      $addToSet:  { friends: senderId },
    });
    await User.findByIdAndUpdate(senderId, {
      $pull:      { friendRequestsSent: myId },
      $addToSet:  { friends: myId },
    });

    await Notification.updateMany(
      { recipient: myId, sender: senderId, type: 'friend_request' },
      { read: true }
    );

    const notification = await Notification.create({
      recipient: senderId,
      sender: myId,
      type: 'friend_accepted',
      data: {},
    });

    const io = req.app.get('io');
    if (io) {
      const { emitToUser } = await import('../socket/index.js');
      const senderUser = await User.findById(myId).select('name avatar').lean();
      emitToUser(io, senderId, 'notification:new', {
        ...notification.toObject(),
        sender: senderUser,
      });
    }

    return res.json({ accepted: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to accept friend request.' });
  }
});

// ── POST /api/friends/decline/:senderId ────────────────────────────────────
router.post('/decline/:senderId', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.senderId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }
  try {
    const myId     = req.user._id.toString();
    const senderId = req.params.senderId;

    await User.findByIdAndUpdate(myId,     { $pull: { friendRequestsReceived: senderId } });
    await User.findByIdAndUpdate(senderId, { $pull: { friendRequestsSent: myId } });

    await Notification.updateMany(
      { recipient: myId, sender: senderId, type: 'friend_request' },
      { read: true }
    );

    return res.json({ declined: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to decline friend request.' });
  }
});

// ── DELETE /api/friends/:friendId ──────────────────────────────────────────
router.delete('/:friendId', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.friendId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }
  try {
    const myId     = req.user._id.toString();
    const friendId = req.params.friendId;

    await User.findByIdAndUpdate(myId,     { $pull: { friends: friendId } });
    await User.findByIdAndUpdate(friendId, { $pull: { friends: myId } });

    return res.json({ removed: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to remove friend.' });
  }
});

// ── GET /api/friends ───────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const me = await User.findById(req.user._id)
      .select('friends friendRequestsReceived friendRequestsSent')
      .populate('friends', 'name avatar isOnline lastSeen bio stack')
      .populate('friendRequestsReceived', 'name avatar bio')
      .populate('friendRequestsSent', 'name avatar')
      .lean();

    return res.json({
      friends: me.friends || [],
      received: me.friendRequestsReceived || [],
      sent: me.friendRequestsSent || [],
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch friends.' });
  }
});

export default router;
