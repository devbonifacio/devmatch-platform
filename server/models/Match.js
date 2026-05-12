import mongoose from 'mongoose';

const matchSchema = new mongoose.Schema(
  {
    users: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
      validate: {
        validator: (v) => v.length === 2,
        message: 'A match must have exactly 2 users.',
      },
    },
  },
  { timestamps: true }
);

// Index for fast lookups
matchSchema.index({ users: 1 });

export default mongoose.model('Match', matchSchema);