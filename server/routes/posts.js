import express from 'express';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import Post from '../models/Post.js';
import Match from '../models/Match.js';
import User from '../models/User.js';
import protect from '../middleware/auth.js';

const router = express.Router();

// ── GET /api/posts/feed ────────────────────────────────────────────────────
// Returns posts from self, matches, and friends (most recent first)
router.get('/feed', protect, async (req, res) => {
  try {
    const myId = req.user._id;

    const me = await User.findById(myId).select('friends blocked').lean();
    const friendIds = me.friends || [];
    const blockedIds = me.blocked || [];

    const matches = await Match.find({ users: myId }).select('users').lean();
    const matchUserIds = matches.flatMap((m) =>
      m.users.map((id) => id.toString()).filter((id) => id !== myId.toString())
    );

    const authorIds = [...new Set([
      myId.toString(),
      ...friendIds.map(String),
      ...matchUserIds,
    ])].filter((id) => !blockedIds.map(String).includes(id));

    const posts = await Post.find({
      author: { $in: authorIds },
      type: 'post',
    })
      .populate('author', 'name avatar isOnline')
      .populate('comments.author', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(40)
      .lean();

    return res.json({ posts });
  } catch (err) {
    console.error('Feed error:', err);
    return res.status(500).json({ message: 'Failed to fetch feed.' });
  }
});

// ── GET /api/posts/stories ─────────────────────────────────────────────────
// Returns active stories (< 24h) from matches and friends
router.get('/stories', protect, async (req, res) => {
  try {
    const myId = req.user._id;
    const me = await User.findById(myId).select('friends blocked').lean();
    const friendIds = me.friends || [];
    const blockedIds = me.blocked || [];

    const matches = await Match.find({ users: myId }).select('users').lean();
    const matchUserIds = matches.flatMap((m) =>
      m.users.map((id) => id.toString()).filter((id) => id !== myId.toString())
    );

    const authorIds = [...new Set([
      myId.toString(),
      ...friendIds.map(String),
      ...matchUserIds,
    ])].filter((id) => !blockedIds.map(String).includes(id));

    const now = new Date();
    const stories = await Post.find({
      author: { $in: authorIds },
      type: 'story',
      expiresAt: { $gt: now },
    })
      .populate('author', 'name avatar')
      .sort({ createdAt: -1 })
      .lean();

    // Group stories by author
    const byAuthor = {};
    for (const story of stories) {
      const aid = story.author._id.toString();
      if (!byAuthor[aid]) {
        byAuthor[aid] = { author: story.author, stories: [] };
      }
      byAuthor[aid].stories.push(story);
    }

    return res.json({ storyGroups: Object.values(byAuthor) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch stories.' });
  }
});

// ── POST /api/posts ────────────────────────────────────────────────────────
const postValidation = [
  body('type').optional().isIn(['post', 'story', 'reel']),
  body('caption').optional().trim().isLength({ max: 2000 }),
  body('image').optional().custom((val) => {
    if (!val) return true;
    if (val.startsWith('data:image/')) return true;
    try { const u = new URL(val); return ['http:', 'https:'].includes(u.protocol); } catch { return false; }
  }).withMessage('Invalid image.'),
];

router.post('/', protect, postValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

  const { type = 'post', caption = '', image = '', video = '' } = req.body;

  if (!caption && !image && !video) {
    return res.status(400).json({ message: 'Post must have caption, image, or video.' });
  }

  try {
    const expiresAt = type === 'story' ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;

    const post = await Post.create({
      author: req.user._id,
      type,
      caption,
      image,
      video,
      expiresAt,
    });

    const populated = await Post.findById(post._id)
      .populate('author', 'name avatar isOnline')
      .lean();

    return res.status(201).json({ post: populated });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create post.' });
  }
});

// ── DELETE /api/posts/:id ──────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid post ID.' });
  }
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found.' });
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized.' });
    }
    await post.deleteOne();
    return res.json({ deleted: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete post.' });
  }
});

// ── POST /api/posts/:id/like ───────────────────────────────────────────────
router.post('/:id/like', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid post ID.' });
  }
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found.' });

    const uid = req.user._id.toString();
    const alreadyLiked = post.likes.some((id) => id.toString() === uid);

    if (alreadyLiked) {
      post.likes = post.likes.filter((id) => id.toString() !== uid);
    } else {
      post.likes.push(req.user._id);
    }
    await post.save();

    return res.json({ liked: !alreadyLiked, likesCount: post.likes.length });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to toggle like.' });
  }
});

// ── POST /api/posts/:id/comment ────────────────────────────────────────────
router.post('/:id/comment', protect, [
  body('text').trim().notEmpty().isLength({ max: 500 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid post ID.' });
  }
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found.' });

    post.comments.push({ author: req.user._id, text: req.body.text });
    await post.save();

    await post.populate('comments.author', 'name avatar');
    const newComment = post.comments[post.comments.length - 1];

    return res.status(201).json({ comment: newComment });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to add comment.' });
  }
});

// ── DELETE /api/posts/:id/comment/:commentId ──────────────────────────────
router.delete('/:id/comment/:commentId', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.commentId)) {
    return res.status(400).json({ message: 'Invalid ID.' });
  }
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found.' });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found.' });

    const uid = req.user._id.toString();
    if (comment.author.toString() !== uid && post.author.toString() !== uid) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    comment.deleteOne();
    await post.save();

    return res.json({ deleted: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete comment.' });
  }
});

// ── GET /api/posts/user/:userId ────────────────────────────────────────────
router.get('/user/:userId', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }
  try {
    const posts = await Post.find({ author: req.params.userId, type: 'post' })
      .populate('author', 'name avatar')
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ posts });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch posts.' });
  }
});

export default router;
