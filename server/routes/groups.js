import express from 'express';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import Group from '../models/Group.js';
import GroupMessage from '../models/GroupMessage.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import protect from '../middleware/auth.js';

const router = express.Router({ mergeParams: true });

// ── GET /api/groups ────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user._id })
      .populate('members', 'name avatar isOnline')
      .populate('creator', 'name avatar')
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ groups });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch groups.' });
  }
});

// ── POST /api/groups ───────────────────────────────────────────────────────
router.post('/', protect, [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

  try {
    const { name, description = '', avatar = '' } = req.body;
    const group = await Group.create({
      name,
      description,
      avatar,
      creator: req.user._id,
      members: [req.user._id],
      admins:  [req.user._id],
    });

    await group.populate('members', 'name avatar isOnline');
    await group.populate('creator', 'name avatar');

    return res.status(201).json({ group });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create group.' });
  }
});

// ── GET /api/groups/:id ────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid group ID.' });
  }
  try {
    const group = await Group.findOne({ _id: req.params.id, members: req.user._id })
      .populate('members', 'name avatar isOnline lastSeen')
      .populate('creator', 'name avatar')
      .populate('pendingInvites.user', 'name avatar')
      .populate('pendingInvites.invitedBy', 'name')
      .lean();

    if (!group) return res.status(404).json({ message: 'Group not found.' });
    return res.json({ group });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch group.' });
  }
});

// ── PUT /api/groups/:id ────────────────────────────────────────────────────
router.put('/:id', protect, [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
], async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid group ID.' });
  }
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    const uid = req.user._id.toString();
    if (!group.admins.some((a) => a.toString() === uid)) {
      return res.status(403).json({ message: 'Only admins can edit this group.' });
    }

    const { name, description, avatar } = req.body;
    if (name !== undefined) group.name = name;
    if (description !== undefined) group.description = description;
    if (avatar !== undefined) group.avatar = avatar;
    await group.save();

    await group.populate('members', 'name avatar isOnline');
    return res.json({ group });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update group.' });
  }
});

// ── DELETE /api/groups/:id ─────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid group ID.' });
  }
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    if (group.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can delete this group.' });
    }

    await GroupMessage.deleteMany({ groupId: group._id });
    await Notification.deleteMany({ 'data.groupId': group._id.toString() });
    await group.deleteOne();

    return res.json({ deleted: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete group.' });
  }
});

// ── POST /api/groups/:id/invite/:userId ─────────────────────────────────────
router.post('/:id/invite/:userId', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ message: 'Invalid ID.' });
  }
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    const myId = req.user._id.toString();
    if (!group.members.some((m) => m.toString() === myId)) {
      return res.status(403).json({ message: 'Only members can invite others.' });
    }

    const targetId = req.params.userId;
    if (group.members.some((m) => m.toString() === targetId)) {
      return res.status(400).json({ message: 'User is already a member.' });
    }
    if (group.pendingInvites.some((i) => i.user.toString() === targetId)) {
      return res.status(400).json({ message: 'Invite already sent.' });
    }

    const targetUser = await User.findById(targetId).select('name').lean();
    if (!targetUser) return res.status(404).json({ message: 'User not found.' });

    group.pendingInvites.push({ user: targetId, invitedBy: req.user._id });
    await group.save();

    // Create notification
    const notification = await Notification.create({
      recipient: targetId,
      sender: req.user._id,
      type: 'group_invite',
      data: { groupId: group._id.toString(), groupName: group.name },
    });

    // Send real-time notification — io is injected via app.set in index.js
    const io = req.app.get('io');
    if (io) {
      const { emitToUser: emit } = await import('../socket/index.js');
      const senderUser = await User.findById(req.user._id).select('name avatar').lean();
      emit(io, targetId, 'notification:new', {
        ...notification.toObject(),
        sender: senderUser,
      });
    }

    return res.json({ invited: true });
  } catch (err) {
    console.error('Invite error:', err);
    return res.status(500).json({ message: 'Failed to invite user.' });
  }
});

// ── POST /api/groups/:id/join ──────────────────────────────────────────────
router.post('/:id/join', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid group ID.' });
  }
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    const uid = req.user._id.toString();
    const inviteIndex = group.pendingInvites.findIndex((i) => i.user.toString() === uid);
    if (inviteIndex === -1) {
      return res.status(403).json({ message: 'No pending invite found.' });
    }

    group.pendingInvites.splice(inviteIndex, 1);
    group.members.push(req.user._id);
    await group.save();

    // Mark invite notification as read
    await Notification.updateMany(
      { recipient: req.user._id, type: 'group_invite', 'data.groupId': group._id.toString() },
      { read: true }
    );

    await group.populate('members', 'name avatar isOnline');
    return res.json({ joined: true, group });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to join group.' });
  }
});

// ── POST /api/groups/:id/decline ──────────────────────────────────────────
router.post('/:id/decline', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid group ID.' });
  }
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    const uid = req.user._id.toString();
    const inviteIndex = group.pendingInvites.findIndex((i) => i.user.toString() === uid);
    if (inviteIndex === -1) {
      return res.status(400).json({ message: 'No pending invite found.' });
    }

    group.pendingInvites.splice(inviteIndex, 1);
    await group.save();

    await Notification.updateMany(
      { recipient: req.user._id, type: 'group_invite', 'data.groupId': group._id.toString() },
      { read: true }
    );

    return res.json({ declined: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to decline invite.' });
  }
});

// ── DELETE /api/groups/:id/leave ───────────────────────────────────────────
router.delete('/:id/leave', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid group ID.' });
  }
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    const uid = req.user._id.toString();
    if (!group.members.some((m) => m.toString() === uid)) {
      return res.status(400).json({ message: 'Not a member.' });
    }
    if (group.creator.toString() === uid) {
      return res.status(400).json({ message: 'Creator must delete the group, not leave.' });
    }

    group.members = group.members.filter((m) => m.toString() !== uid);
    group.admins  = group.admins.filter((a) => a.toString() !== uid);
    await group.save();

    return res.json({ left: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to leave group.' });
  }
});

// ── DELETE /api/groups/:id/member/:userId ──────────────────────────────────
router.delete('/:id/member/:userId', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ message: 'Invalid ID.' });
  }
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    const myId = req.user._id.toString();
    if (!group.admins.some((a) => a.toString() === myId)) {
      return res.status(403).json({ message: 'Only admins can remove members.' });
    }

    const targetId = req.params.userId;
    if (group.creator.toString() === targetId) {
      return res.status(400).json({ message: 'Cannot remove the group creator.' });
    }

    group.members = group.members.filter((m) => m.toString() !== targetId);
    group.admins  = group.admins.filter((a) => a.toString() !== targetId);
    await group.save();

    return res.json({ removed: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to remove member.' });
  }
});

// ── GET /api/groups/:id/messages ───────────────────────────────────────────
router.get('/:id/messages', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid group ID.' });
  }
  try {
    const group = await Group.findOne({ _id: req.params.id, members: req.user._id }).lean();
    if (!group) return res.status(403).json({ message: 'Not a member of this group.' });

    const messages = await GroupMessage.find({ groupId: req.params.id })
      .populate('sender', 'name avatar')
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ messages });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch messages.' });
  }
});

// ── POST /api/groups/:id/messages ─────────────────────────────────────────
router.post('/:id/messages', protect, [
  body('text').optional().trim().isLength({ max: 1000 }),
], async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid group ID.' });
  }
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

  try {
    const group = await Group.findOne({ _id: req.params.id, members: req.user._id }).lean();
    if (!group) return res.status(403).json({ message: 'Not a member of this group.' });

    const { text = '', image = '', audio = '' } = req.body;
    if (!text && !image && !audio) {
      return res.status(400).json({ message: 'Message must have content.' });
    }

    const msg = await GroupMessage.create({
      groupId: req.params.id,
      sender: req.user._id,
      text,
      image,
      audio,
    });

    await msg.populate('sender', 'name avatar');

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${req.params.id}`).emit('group:message', msg);
    }

    return res.status(201).json({ message: msg });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to send message.' });
  }
});

export default router;
