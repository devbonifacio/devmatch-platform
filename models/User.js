import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // never return password in queries by default
    },
    avatar: {
      type: String,
      default: '', // URL to profile picture
    },
    bio: {
      type: String,
      maxlength: [300, 'Bio cannot exceed 300 characters'],
      default: '',
    },
    github: {
      type: String,
      default: '',
      trim: true,
    },
    // Tech stack — array of strings e.g. ['React', 'Node.js', 'Python']
    stack: {
      type: [String],
      default: [],
    },
    // What kind of projects the dev is looking for
    lookingFor: {
      type: [String],
      enum: ['open-source', 'startup', 'freelance', 'learning', 'hackathon'],
      default: [],
    },
    // IDs of devs this user has liked
    liked: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // IDs of devs this user has skipped
    skipped: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Online status for chat
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Method to compare passwords at login
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);