import mongoose from 'mongoose';

const MAX_B64_IMAGE = 5 * 1024 * 1024; // 5 MB
const MAX_B64_AUDIO = 3 * 1024 * 1024; // 3 MB

const messageSchema = new mongoose.Schema(
  {
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
      trim: true,
      default: '',
    },
    image: {
      type: String,
      default: '',
      validate: {
        validator: (v) => !v || (v.startsWith('data:image/') && v.length <= MAX_B64_IMAGE),
        message: 'Image must be a valid data URI under 5 MB.',
      },
    },
    audio: {
      type: String,
      default: '',
      validate: {
        validator: (v) => !v || (v.startsWith('data:audio/') && v.length <= MAX_B64_AUDIO),
        message: 'Audio must be a valid data URI under 3 MB.',
      },
    },
    viewOnce: { type: Boolean, default: false },
    viewedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.pre('validate', function (next) {
  if (!this.text && !this.image && !this.audio) {
    return next(new Error('Message must contain text, an image, or audio.'));
  }
  next();
});

// Fast lookup of all messages in a match, ordered by time
messageSchema.index({ matchId: 1, createdAt: 1 });

export default mongoose.model('Message', messageSchema);
