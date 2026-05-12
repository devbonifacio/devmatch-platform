import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Match from '../models/Match.js';
import Group from '../models/Group.js';
import { isBlacklisted, checkSocketEventRate, clearSocketEventRate } from '../middleware/security.js';

// Map: userId (string) → socketId
const onlineUsers = new Map();

// Group voice rooms: groupId (string) → Map of userId → { socketId, name, avatar }
const groupVoiceRooms = new Map();

export function emitToUser(io, userId, event, data) {
  const socketId = onlineUsers.get(String(userId));
  if (socketId) io.to(socketId).emit(event, data);
}

function parseCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...val] = part.trim().split('=');
    if (key.trim() === name) return decodeURIComponent(val.join('='));
  }
  return null;
}

async function isMatchParticipant(userId, matchId) {
  if (!mongoose.isValidObjectId(matchId)) return false;
  const match = await Match.findById(matchId).select('users').lean();
  if (!match) return false;
  return match.users.some((id) => id.toString() === String(userId));
}

async function isGroupMember(userId, groupId) {
  if (!mongoose.isValidObjectId(groupId)) return false;
  const group = await Group.findById(groupId).select('members').lean();
  if (!group) return false;
  return group.members.some((id) => id.toString() === String(userId));
}

export const setupSocket = (io) => {
  // ── Authentication middleware ─────────────────────────────────────────────
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
    socket.on('chat:join', async (matchId) => {
      try {
        if (!(await isMatchParticipant(userId, matchId))) return;
        socket.join(String(matchId));
      } catch { /* ignore */ }
    });

    // ── chat:message ─────────────────────────────────────────────────────────
    socket.on('chat:message', async (message) => {
      try {
        if (!message?.matchId) return;
        if (!checkSocketEventRate(socket.id, 30, 60_000)) {
          socket.emit('chat:error', { message: 'Slow down — you are sending messages too fast.' });
          return;
        }
        if (!(await isMatchParticipant(userId, message.matchId))) {
          socket.emit('chat:error', { message: 'Not authorized for this match.' });
          return;
        }
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
        if (!mongoose.isValidObjectId(matchId)) return;
        const match = await Match.findById(matchId).select('users').lean();
        if (!match) return;
        if (!match.users.some((id) => id.toString() === String(userId))) return;
        match.users.forEach((participantId) => {
          if (participantId.toString() !== String(userId)) {
            emitToUser(io, participantId, 'chat:typing', { userId, isTyping });
          }
        });
      } catch { /* ignore */ }
    });

    // ── chat:leave ───────────────────────────────────────────────────────────
    socket.on('chat:leave', (matchId) => {
      socket.leave(String(matchId));
    });

    // ── WebRTC Voice Call (1-on-1) ───────────────────────────────────────────
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

    // ── Group Chat ────────────────────────────────────────────────────────────
    socket.on('group:join', async (groupId) => {
      try {
        if (!(await isGroupMember(userId, groupId))) return;
        socket.join(`group:${groupId}`);
      } catch { /* ignore */ }
    });

    socket.on('group:leave', (groupId) => {
      socket.leave(`group:${groupId}`);
    });

    socket.on('group:typing', async ({ groupId, isTyping }) => {
      try {
        if (!(await isGroupMember(userId, groupId))) return;
        socket.to(`group:${groupId}`).emit('group:typing', { userId, isTyping });
      } catch { /* ignore */ }
    });

    // ── Group Voice Calls (Discord-style mesh WebRTC) ─────────────────────────
    socket.on('group:voice-join', async ({ groupId }) => {
      try {
        if (!mongoose.isValidObjectId(groupId)) return;
        if (!(await isGroupMember(userId, groupId))) return;

        const user = await User.findById(userId).select('name avatar').lean();
        if (!user) return;

        if (!groupVoiceRooms.has(groupId)) {
          groupVoiceRooms.set(groupId, new Map());
        }
        const room = groupVoiceRooms.get(groupId);

        // Send current participants to the joining user
        const currentParticipants = [...room.entries()].map(([uid, info]) => ({
          userId: uid,
          name:   info.name,
          avatar: info.avatar,
        }));
        socket.emit('group:voice-participants', { groupId, participants: currentParticipants });

        // Add joining user
        room.set(userId, { socketId: socket.id, name: user.name, avatar: user.avatar });
        socket.join(`voice:${groupId}`);

        // Notify existing participants
        socket.to(`voice:${groupId}`).emit('group:voice-user-joined', {
          groupId,
          userId,
          name:   user.name,
          avatar: user.avatar,
        });
      } catch { /* ignore */ }
    });

    socket.on('group:voice-leave', ({ groupId }) => {
      try {
        const room = groupVoiceRooms.get(groupId);
        if (room) {
          room.delete(userId);
          if (room.size === 0) groupVoiceRooms.delete(groupId);
        }
        socket.leave(`voice:${groupId}`);
        socket.to(`voice:${groupId}`).emit('group:voice-user-left', { groupId, userId });
      } catch { /* ignore */ }
    });

    // WebRTC signaling for group calls
    socket.on('group:voice-offer', async ({ groupId, to, offer }) => {
      try {
        if (!mongoose.isValidObjectId(groupId)) return;
        const room = groupVoiceRooms.get(groupId);
        if (!room || !room.has(userId)) return;

        const targetInfo = room.get(String(to));
        if (targetInfo) {
          io.to(targetInfo.socketId).emit('group:voice-offer', {
            groupId,
            from:  userId,
            offer,
          });
        }
      } catch { /* ignore */ }
    });

    socket.on('group:voice-answer', async ({ groupId, to, answer }) => {
      try {
        if (!mongoose.isValidObjectId(groupId)) return;
        const room = groupVoiceRooms.get(groupId);
        if (!room || !room.has(userId)) return;

        const targetInfo = room.get(String(to));
        if (targetInfo) {
          io.to(targetInfo.socketId).emit('group:voice-answer', {
            groupId,
            from:   userId,
            answer,
          });
        }
      } catch { /* ignore */ }
    });

    socket.on('group:voice-ice', async ({ groupId, to, candidate }) => {
      try {
        if (!mongoose.isValidObjectId(groupId)) return;
        const room = groupVoiceRooms.get(groupId);
        if (!room || !room.has(userId)) return;

        const targetInfo = room.get(String(to));
        if (targetInfo) {
          io.to(targetInfo.socketId).emit('group:voice-ice', {
            groupId,
            from:      userId,
            candidate,
          });
        }
      } catch { /* ignore */ }
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      clearSocketEventRate(socket.id);
      onlineUsers.delete(userId);

      // Remove from any voice rooms
      for (const [gid, room] of groupVoiceRooms.entries()) {
        if (room.has(userId)) {
          room.delete(userId);
          if (room.size === 0) groupVoiceRooms.delete(gid);
          socket.to(`voice:${gid}`).emit('group:voice-user-left', { groupId: gid, userId });
        }
      }

      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
      io.emit('user:offline', { userId });
    });
  });
};
