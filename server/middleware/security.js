import helmet from 'helmet';

// ── Token blacklist ────────────────────────────────────────────────────────
// Maps token → expiry (ms). Cleaned up lazily on each lookup.
const blacklist = new Map();

export function addToBlacklist(token, expiresAtMs) {
  blacklist.set(token, expiresAtMs);
}

export function isBlacklisted(token) {
  const exp = blacklist.get(token);
  if (exp === undefined) return false;
  if (Date.now() > exp) { blacklist.delete(token); return false; }
  return true;
}

// ── Refresh token store ────────────────────────────────────────────────────
// Maps userId (string) → { token, expiresAt (ms) }
// Resets on server restart — users re-login after restart (acceptable for dev).
const refreshStore = new Map();

export function storeRefreshToken(userId, token, expiresAtMs) {
  refreshStore.set(String(userId), { token, expiresAtMs });
}

export function validateRefreshToken(userId, token) {
  const entry = refreshStore.get(String(userId));
  if (!entry) return false;
  if (Date.now() > entry.expiresAtMs) { refreshStore.delete(String(userId)); return false; }
  return entry.token === token;
}

export function removeRefreshToken(userId) {
  refreshStore.delete(String(userId));
}

// ── IP-based rate limiting ────────────────────────────────────────────────
function createIpLimit(max, windowMs, message) {
  const store = new Map();
  return function (req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || now >= entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({ message, retryAfter });
    }
    entry.count += 1;
    return next();
  };
}

// 3 attempts / 15 min per IP — blocks brute force on login
export const loginRateLimit = createIpLimit(
  3, 15 * 60 * 1000,
  'Too many login attempts. Try again in 15 minutes.'
);

// 3 registrations / hour per IP — blocks account farming
export const registerRateLimit = createIpLimit(
  3, 60 * 60 * 1000,
  'Too many registration attempts. Try again later.'
);

// 100 requests / 15 min per IP — global DoS protection
export const globalRateLimit = createIpLimit(
  100, 15 * 60 * 1000,
  'Too many requests. Please slow down.'
);

// ── Socket event rate limit ────────────────────────────────────────────────
// Returns true if event is allowed, false if rate limit exceeded.
const socketEventStore = new Map();

export function checkSocketEventRate(socketId, max = 30, windowMs = 60_000) {
  const now = Date.now();
  const entry = socketEventStore.get(socketId);
  if (!entry || now >= entry.resetAt) {
    socketEventStore.set(socketId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

export function clearSocketEventRate(socketId) {
  socketEventStore.delete(socketId);
}

// ── Helmet configuration ───────────────────────────────────────────────────
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:', 'http:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      fontSrc: ["'self'", 'https:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'deny' },
  hsts: { maxAge: 31_536_000, includeSubDomains: true },
  referrerPolicy: { policy: 'no-referrer' },
  noSniff: true,
  xssFilter: true,
});

// ── Global error handler ──────────────────────────────────────────────────
// Must be registered LAST in Express middleware chain (4-arg signature).
export function globalErrorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(status).json({
    message: status < 500 ? err.message : 'Internal server error.',
    ...(isDev && status >= 500 && { stack: err.stack }),
  });
}