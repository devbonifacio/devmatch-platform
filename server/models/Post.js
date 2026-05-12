import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:   { type: String, required: true, maxlength: 500, trim: true },
}, { timestamps: true });

const postSchema = new mongoose.Schema({
  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:      { type: String, enum: ['post', 'story', 'reel'], default: 'post' },
  caption:   { type: String, maxlength: 2000, default: '', trim: true },
  image:     { type: String, default: '' },
  video:     { type: String, default: '' },
  likes:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments:  [commentSchema],
  expiresAt: { type: Date, default: null },
  views:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

// TTL index: auto-delete stories when expiresAt is reached
postSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: 'date' } } }
);
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });

export default mongoose.model('Post', postSchema);
