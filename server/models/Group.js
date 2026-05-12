import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
  name:        { type: String, required: true, maxlength: 100, trim: true },
  description: { type: String, maxlength: 500, default: '', trim: true },
  avatar:      { type: String, default: '' },
  creator:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  pendingInvites: [{
    user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sentAt:    { type: Date, default: Date.now },
  }],
}, { timestamps: true });

groupSchema.index({ members: 1 });
groupSchema.index({ creator: 1 });

export default mongoose.model('Group', groupSchema);
