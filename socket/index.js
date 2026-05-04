import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Match from '../models/Match.js';
import { isBlacklisted, checkSocketEventRate, clearSocketEventRate } from '../middleware/security.js';

// Map: userId (string) → socketId
const onlineUsers = new Map();

// Parse a single cookie value from a Cookie header string
function parseCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...val] = part.trim().split('=');
    if (key.trim() === name) return decodeURIComponent(val.join('='));
  }
  return null;
}

// Verify that userId is a participant of matchId (DB check)
async function isMatchParticipant(userId, matchId) {
  if (!mongoose.isValidObjectId(matchId)) return false;
  const match = await Match.findById(matchId).select('users').lean();
  if (!match) return false;
  return match.users.some((id) => id.toString() === String(userId));
}

export const setupSocket = (io) => {
  // ── Authentication middleware ─────────────────────────────────────────────
  // Reads the access_token cookie forwarded by the Vite proxy (same-origin in dev,
  // same-domain in production).
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      const token = parseCookieValue(cookieHeader, 'access_token');

      if (!token) return next(new Error('Authentication required'));
      if (isBlacklisted(token)) return next(new Error('Token revoked'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;

    onlineUsers.set(userId, socket.id);
    await User.findByIdAndUpdate(userId, { isOnline: true });
    io.emit('user:online', { userId });

    // ── chat:join ────────────────────────────────────────────────────────────
    // CRIT-2 fixed: verify the user is a participant before joining the room.
    socket.on('chat:join', async (matchId) => {
      try {
        if (!(await isMatchParticipant(userId, matchId))) return;
        socket.join(String(matchId));
      } catch { /* ignore DB errors */ }
    });

    // ── chat:message ─────────────────────────────────────────────────────────
    // CRIT-3 fixed: verify participant + rate limit + message size.
    socket.on('chat:message', async (message) => {
      try {
        if (!message?.matchId) return;

        // Rate limit: 30 messages / minute per socket
        if (!checkSocketEventRate(socket.id, 30, 60_000)) {
          socket.emit('chat:error', { message: 'Slow down — you are sending messages too fast.' });
          return;
        }

        // Verify the sender belongs to this match
        if (!(await isMatchParticipant(userId, message.matchId))) {
          socket.emit('chat:error', { message: 'Not authorized for this match.' });
          return;
        }

        // Enforce message size limit (match schema maxlength of 1000)
        if (typeof message.text === 'string' && message.text.length > 1000) {
          socket.emit('chat:error', { message: 'Message is too long (max 1000 characters).' });
          return;
        }

        socket.to(String(message.matchId)).emit('chat:message', message);
      } catch {
        socket.emit('chat:error', { message: 'Failed to broadcast message.' });
      }
    });

    // ── chat:typing ──────────────────────────────────────────────────────────
    socket.on('chat:typing', async ({ matchId, isTyping }) => {
      try {
        if (!(await isMatchParticipant(userId, matchId))) return;
        socket.to(String(matchId)).emit('chat:typing', { userId, isTyping });
      } catch { /* ignore */ }
    });

    // ── chat:leave ───────────────────────────────────────────────────────────
    socket.on('chat:leave', (matchId) => {
      socket.leave(String(matchId));
    });

    // ── WebRTC Voice Call Signaling ──────────────────────────────────────────
    // CRIT-4 fixed: verify a match exists between caller and callee before forwarding.

    async function verifyCallAuthorization(matchId, targetUserId) {
      if (!mongoose.isValidObjectId(matchId)) return false;
      const match = await Match.findById(matchId).select('users').lean();
      if (!match) return false;
      const ids = match.users.map((id) => id.toString());
      return ids.includes(String(userId)) && ids.includes(String(targetUserId));
    }

    socket.on('call:offer', async ({ to, offer, matchId }) => {
      try {
        if (!(await verifyCallAuthorization(matchId, to))) return;
        const targetSocketId = onlineUsers.get(String(to));
        if (targetSocketId) {
          // Use socket.userId as `from` — prevents spoofing via client-supplied `from`
          io.to(targetSocketId).emit('call:offer', { offer, from: userId, matchId });
        }
      } catch { /* ignore */ }
    });

    socket.on('call:answer', async ({ to, answer, matchId }) => {
      try {
        if (!(await verifyCallAuthorization(matchId, to))) return;
        const targetSocketId = onlineUsers.get(String(to));
        if (targetSocketId) {
          io.to(targetSocketId).emit('call:answer', { answer, matchId });
        }
      } catch { /* ignore */ }
    });

    socket.on('call:ice-candidate', async ({ to, candidate, matchId }) => {
      try {
        if (!(await verifyCallAuthorization(matchId, to))) return;
        const targetSocketId = onlineUsers.get(String(to));
        if (targetSocketId) {
          io.to(targetSocketId).emit('call:ice-candidate', { candidate, matchId });
        }
      } catch { /* ignore */ }
    });

    socket.on('call:end', async ({ to, matchId }) => {
      try {
        if (!(await verifyCallAuthorization(matchId, to))) return;
        const targetSocketId = onlineUsers.get(String(to));
        if (targetSocketId) {
          io.to(targetSocketId).emit('call:end', { matchId });
        }
      } catch { /* ignore */ }
    });

    socket.on('call:reject', async ({ to, matchId }) => {
      try {
        if (!(await verifyCallAuthorization(matchId, to))) return;
        const targetSocketId = onlineUsers.get(String(to));
        if (targetSocketId) {
          io.to(targetSocketId).emit('call:reject', { matchId });
        }
      } catch { /* ignore */ }
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      clearSocketEventRate(socket.id);
      onlineUsers.delete(userId);
      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
      io.emit('user:offline', { userId });
    });
  });
};