import express from 'express';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import protect from '../middleware/auth.js';
import {
  loginRateLimit,
  registerRateLimit,
  addToBlacklist,
  isBlacklisted,
  storeRefreshToken,
  validateRefreshToken,
  removeRefreshToken,
} from '../middleware/security.js';

const router = express.Router();

// ── Cookie settings ────────────────────────────────────────────────────────
const IS_PROD = process.env.NODE_ENV === 'production';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

const ACCESS_TTL_MS  = 15 * 60 * 1000;          // 15 minutes
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function baseCookieOpts() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'none' : 'lax',
  };
}

function setAuthCookies(res, userId) {
  const accessToken = jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  const refreshToken = jwt.sign(
    { id: userId, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  storeRefreshToken(userId, refreshToken, Date.now() + REFRESH_TTL_MS);

  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookieOpts(),
    maxAge: ACCESS_TTL_MS,
    path: '/',
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookieOpts(),
    maxAge: REFRESH_TTL_MS,
    path: '/api/auth/refresh',
  });

  return accessToken;
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookieOpts(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookieOpts(), path: '/api/auth/refresh' });
}

// ── Validation rules ───────────────────────────────────────────────────────
// Allows letters, emoji (including ZWJ sequences and skin-tone modifiers), spaces, hyphens, apostrophes, dots
const NAME_RE = new RegExp('^[\\p{L}\\p{M}\\p{Extended_Pictographic}\\u200D\\uFE0F\\s\\-\'.]+$', 'u');

const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required.')
    .isLength({ max: 50 }).withMessage('Name cannot exceed 50 characters.')
    .matches(NAME_RE).withMessage('Name contains invalid characters.'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Invalid email format.')
    .normalizeEmail({ gmail_remove_dots: false, gmail_remove_subaddress: false }),
  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and a number.'),
];

const loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Invalid email format.')
    .normalizeEmail({ gmail_remove_dots: false, gmail_remove_subaddress: false }),
  body('password')
    .notEmpty().withMessage('Password is required.'),
];

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: errors.array()[0].msg });
    return false;
  }
  return true;
}

// ── POST /api/auth/register ────────────────────────────────────────────────
router.post('/register', registerRateLimit, registerValidation, async (req, res) => {
  if (!handleValidation(req, res)) return;

  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email: String(email) });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered.' });
    }

    const user = await User.create({ name, email, password });
    setAuthCookies(res, user._id);

    return res.status(201).json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        github: user.github,
        stack: user.stack,
        lookingFor: user.lookingFor,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Email already registered.' });
    }
    return res.status(500).json({ message: 'Server error during registration.' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', loginRateLimit, loginValidation, async (req, res) => {
  if (!handleValidation(req, res)) return;

  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: String(email) }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    setAuthCookies(res, user._id);

    return res.json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        github: user.github,
        stack: user.stack,
        lookingFor: user.lookingFor,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error during login.' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────
router.post('/logout', protect, (req, res) => {
  // Blacklist the current access token until it expires naturally
  const token = req.currentToken;
  if (token) {
    try {
      const decoded = jwt.decode(token);
      if (decoded?.exp) {
        addToBlacklist(token, decoded.exp * 1000);
      }
    } catch (_) { /* ignore decode errors */ }
  }

  removeRefreshToken(req.user._id);
  clearAuthCookies(res);
  return res.json({ message: 'Logged out.' });
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const refreshToken = parseCookieValue(req.headers.cookie, REFRESH_COOKIE);

  if (!refreshToken) {
    return res.status(401).json({ message: 'No refresh token.' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ message: 'Invalid token type.' });
    }

    if (!validateRefreshToken(decoded.id, refreshToken)) {
      return res.status(401).json({ message: 'Refresh token invalid or expired.' });
    }

    // Issue new access token (rotate: also issue new refresh token)
    setAuthCookies(res, decoded.id);
    return res.json({ message: 'Token refreshed.' });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired refresh token.' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────
router.get('/me', protect, (req, res) => {
  res.json({ user: req.user });
});

// ── Utility ───────────────────────────────────────────────────────────────
function parseCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...val] = part.trim().split('=');
    if (key.trim() === name) return decodeURIComponent(val.join('='));
  }
  return null;
}

export default router;