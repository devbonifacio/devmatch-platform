import mongoose from 'mongoose';

const groupMessageSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  sender:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  text:    { type: String, maxlength: 1000, default: '', trim: true },
  image:   { type: String, default: '' },
  audio:   { type: String, default: '' },
}, { timestamps: true });

groupMessageSchema.pre('validate', function (next) {
  if (!this.text && !this.image && !this.audio) {
    return next(new Error('Message must have text, image, or audio.'));
  }
  next();
});

groupMessageSchema.index({ groupId: 1, createdAt: 1 });

export default mongoose.model('GroupMessage', groupMessageSchema);
