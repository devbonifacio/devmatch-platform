import mongoose from 'mongoose';

const matchSchema = new mongoose.Schema(
  {
    // The two users who matched — always stored sorted so we don't have duplicates
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  },
  { timestamps: true }
);

// Ensure we never have duplicate match documents for the same pair
matchSchema.index({ users: 1 }, { unique: true });

export default mongoose.model('Match', matchSchema);