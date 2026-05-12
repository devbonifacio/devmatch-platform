/**
 * middleware/rateLimit.js
 *
 * User-level rate limiting (authenticated routes). Uses in-memory Maps.
 * For multi-instance deployments, replace with Redis-backed sliding window.
 *
 * IP-level limits (login, register, global) live in middleware/security.js.
 */

const likesStore    = new Map();
const messagesStore = new Map();

function createRateLimit(store, max, windowMs, label) {
  return function rateLimit(req, res, next) {
    const userId = req.user?._id?.toString();
    if (!userId) return next();

    const now   = Date.now();
    const entry = store.get(userId);

    if (!entry || now >= entry.resetAt) {
      store.set(userId, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        message: `Too many ${label}. Wait ${retryAfterSec}s and try again.`,
        retryAfter: retryAfterSec,
      });
    }

    entry.count += 1;
    return next();
  };
}

// 100 likes per hour
export const rateLimitLikes = createRateLimit(likesStore, 100, 60 * 60 * 1000, 'likes');

// 30 messages per minute (REST fallback endpoint)
export const rateLimitMessages = createRateLimit(messagesStore, 30, 60 * 1000, 'messages');