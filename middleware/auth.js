import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { isBlacklisted } from './security.js';

// Parse a single cookie value from a Cookie header string
function parseCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...val] = part.trim().split('=');
    if (key.trim() === name) return decodeURIComponent(val.join('='));
  }
  return null;
}

const protect = async (req, res, next) => {
  try {
    // Primary: httpOnly cookie set by /auth/login
    let token = parseCookieValue(req.headers.cookie, 'access_token');

    // Fallback: Authorization header (for direct API testing / non-browser clients)
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return res.status(401).json({ message: 'No token provided. Please log in.' });
    }

    // Reject tokens that have been explicitly invalidated (logout)
    if (isBlacklisted(token)) {
      return res.status(401).json({ message: 'Token revoked. Please log in again.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user (password always excluded by schema select:false)
    req.user = await User.findById(decoded.id).select('-liked -skipped');
    if (!req.user) {
      return res.status(401).json({ message: 'User no longer exists.' });
    }

    // Expose the raw token so /logout can blacklist it
    req.currentToken = token;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'Invalid token. Please log in again.' });
  }
};

export default protect;