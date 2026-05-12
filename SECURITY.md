# DevMatch — Security Implementation

Implemented in response to the Phase 1 audit (2026-05-04).

---

## 2.1 NoSQL Injection

| File | Change |
|---|---|
| `server/index.js` | Added `express-mongo-sanitize` globally — strips `$` and `.` operators from `req.body`, `req.query`, `req.params` before they reach any route handler |
| `server/routes/auth.js` | `email` field cast to `String(email)` before `findOne` as a secondary guard |
| `server/models/User.js` | Email validated with regex at schema level; avatar and github validated with URL parser to reject non-HTTP protocols |

---

## 2.2 Input Validation & Sanitization

`express-validator` applied at route level with a whitelist approach:

| Route | Validated fields |
|---|---|
| POST `/auth/register` | `name` (regex, max 50), `email` (isEmail + normalizeEmail), `password` (min 8, uppercase + lowercase + digit) |
| POST `/auth/login` | `email` (isEmail), `password` (notEmpty) |
| PUT `/users/profile` | `name`, `bio` (trim, max), `github` (https://github.com only), `avatar` (http/https only), `stack` (array max 20), `lookingFor` (enum whitelist) |
| POST `/messages/:matchId` | `text` (notEmpty, max 1000 chars) |

Body limit reduced from 4 MB → **10 KB** in `server/index.js`.

---

## 2.3 Rate Limiting

### IP-based (in `server/middleware/security.js`)

| Endpoint | Limit |
|---|---|
| `POST /auth/login` | 5 attempts / 15 min per IP |
| `POST /auth/register` | 3 attempts / 1 hour per IP |
| All routes (global) | 100 requests / 15 min per IP |

### User-based (in `server/middleware/rateLimit.js`)

| Endpoint | Limit |
|---|---|
| `POST /matches/like/:id` | 100 likes / hour per user |
| `POST /messages/:matchId` | 30 messages / min per user |

### Socket.io events

30 `chat:message` events / minute per socket connection.

> **Note:** All rate limit stores are in-memory Maps. A Redis-backed store is recommended for multi-instance deployments.

---

## 2.4 JWT & Authentication

| Change | Detail |
|---|---|
| Access token lifetime | Reduced from **7 days → 15 minutes** |
| Refresh token | 7-day token, stored server-side in a Map; rotated on each use |
| Token blacklist | Logout blacklists the current access token until its natural expiry |
| Socket.io | Re-authenticates via cookie on every connection (not just the first) |
| Startup warning | Server warns at boot if `JWT_SECRET` is shorter than 64 characters |

---

## 2.5 Security Headers (Helmet)

Configured in `server/middleware/security.js`:

- `Content-Security-Policy` — default-src 'self', no inline scripts
- `X-Frame-Options: DENY` — clickjacking protection
- `X-XSS-Protection` — legacy browser protection
- `Strict-Transport-Security` — max-age 1 year with subdomains
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`

---

## 2.6 CORS

- Origin restricted to `CLIENT_URL` env var (defaults to `http://localhost:5173`)
- Methods explicitly listed: `GET, POST, PUT, DELETE, OPTIONS`
- Allowed headers: `Content-Type` only
- `credentials: true` required for httpOnly cookie transport

---

## 2.7 XSS — Frontend

- React JSX escapes all text interpolations by default (no `dangerouslySetInnerHTML` in the codebase)
- `DOMPurify` installed; `safeUrl()` utility in `client/src/lib/sanitize.js` validates GitHub/avatar URLs before use in `href`/`src` attributes — rejects `javascript:` and `data:` protocols
- GitHub URL field validated server-side to `https://github.com` only

---

## 2.8 Sensitive Data Protection

| Change | Detail |
|---|---|
| JWT storage | Moved from **localStorage → httpOnly cookie** — inaccessible to JavaScript |
| Socket.io auth | Cookie forwarded automatically via Vite proxy (same-origin) in dev; same-domain in production |
| Password field | `select: false` in schema — never returned in any query |
| Public profiles | `GET /users/:id` now excludes `liked[]` and `skipped[]` arrays |
| Error responses | `error.message` never exposed to clients in production; 500 errors return a generic message |
| `.gitignore` | `server/.env` and `client/.env` already excluded |

---

## 2.9 Socket.io Authorization

All four critical vulnerabilities fixed:

| Event | Before | After |
|---|---|---|
| `chat:join` | Any authenticated user could join any room | DB check: user must be a participant of the match |
| `chat:message` | No authorization check | DB check per message + rate limit + 1000-char cap |
| `call:offer/answer/ice/end/reject` | No authorization | DB check: both users must share a match; `from` field taken from `socket.userId` (not client-supplied) |
| Token validation | Only on initial handshake | Cookie re-read on every new connection |

---

## 2.10 Error Handling

- `globalErrorHandler` middleware registered last in Express — catches all unhandled errors
- In production (`NODE_ENV=production`): stack traces are suppressed
- In development: stack traces included for debugging

---

## 2.11 Known Limitations

- `user:online` / `user:offline` events are still broadcast to all connected sockets (not just matched users). This reveals online status and timing to any authenticated user. Fixing this requires per-broadcast DB queries and is left as a future improvement.
- Rate limit stores are in-memory. A server restart resets all counters. Use Redis for production deployments.
- Refresh tokens are stored in a server-side Map. A server restart invalidates all refresh tokens (users must re-login). A database-backed store is recommended for production.

---

## Files Changed

### Server
- `middleware/security.js` *(new)* — Helmet, IP rate limits, token blacklist, refresh store, socket rate limit, error handler
- `index.js` — Helmet, mongo-sanitize, 10 KB body limit, explicit CORS, global rate limit, error handler
- `routes/auth.js` — express-validator, IP rate limits, httpOnly cookies, refresh token, logout endpoint
- `middleware/auth.js` — reads `access_token` cookie, checks blacklist, falls back to Authorization header
- `socket/index.js` — cookie auth, match participant checks on all events, socket rate limiting
- `routes/users.js` — express-validator on profile update, `liked`/`skipped` excluded from public profiles
- `routes/matches.js` — removed `error.message` from 500 responses
- `routes/messages.js` — express-validator on message text
- `middleware/rateLimit.js` — message limit lowered to 30/min
- `models/User.js` — email regex, avatar/github URL validators, password minlength 8

### Client
- `lib/api.js` — `withCredentials: true`, 401 interceptor with automatic token refresh
- `lib/sanitize.js` *(new)* — DOMPurify `sanitizeText` and `safeUrl` utilities
- `store/authStore.js` — removed localStorage/token; session restored via `fetchMe` on load
- `App.jsx` — unconditional `fetchMe` on mount; `auth:session-expired` event listener
- `components/ProtectedRoute.jsx` — guards on `user` object instead of `token`
- `pages/Chat.jsx` — socket connects to current origin via Vite proxy; `withCredentials: true`; no explicit auth token
- `components/ChatWindow.jsx` — `safeUrl()` applied to GitHub href
- `vite.config.js` — `/socket.io` proxy with `ws: true` so cookies are same-origin in development