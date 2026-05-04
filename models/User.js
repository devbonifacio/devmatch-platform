import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

function isSafeHttpUrl(val) {
  if (!val) return true;
  try {
    const url = new URL(val);
    return ['http:', 'https:'].includes(url.protocol);
  } catch { return false; }
}

function isGithubUrl(val) {
  if (!val) return true;
  try {
    const url = new URL(val);
    return url.protocol === 'https:' && url.hostname === 'github.com';
  } catch { return false; }
}

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
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    avatar: {
      type: String,
      default: '',
      validate: {
        validator: isSafeHttpUrl,
        message: 'Avatar must be a valid HTTP/HTTPS URL',
      },
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
      validate: {
        validator: isGithubUrl,
        message: 'GitHub must be a valid https://github.com URL',
      },
    },
    stack: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => v.length <= 20,
        message: 'Stack cannot exceed 20 technologies.',
      },
    },
    lookingFor: {
      type: [String],
      enum: ['open-source', 'startup', 'freelance', 'learning', 'hackathon'],
      default: [],
    },
    liked:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    skipped: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date,    default: Date.now },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);