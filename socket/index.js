import User from '../models/User.js';
import jwt from 'jsonwebtoken';

// Map to keep track of which socketId belongs to which userId
const onlineUsers = new Map();

export const setupSocket = (io) => {
  // Middleware — authenticate socket connections with JWT
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    console.log(`🔌 User connected: ${userId}`);

    // Register user as online
    onlineUsers.set(userId, socket.id);
    await User.findByIdAndUpdate(userId, { isOnline: true });

    // Broadcast online status to all connected clients
    io.emit('user:online', { userId });

    // Join a chat room for a specific match
    socket.on('chat:join', (matchId) => {
      socket.join(String(matchId));
      console.log(`JOIN ROOM: ${String(matchId)} | user: ${userId}`);
    });

    // Handle new message sent via socket
    socket.on('chat:message', async (message) => {
      try {
        if (!message || !message.matchId) return;
        console.log('SOCKET MESSAGE:', message);
        socket.to(String(message.matchId)).emit('chat:message', message);
      } catch (error) {
        socket.emit('chat:error', { message: 'Failed to broadcast message.' });
      }
    });

    // Handle typing indicator
    socket.on('chat:typing', ({ matchId, isTyping }) => {
      try {
        socket.to(String(matchId)).emit('chat:typing', { userId, isTyping });
      } catch (error) {
        console.error('Typing indicator error:', error);
      }
    });

    // Leave a room
    socket.on('chat:leave', (matchId) => {
      socket.leave(String(matchId));
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`🔌 User disconnected: ${userId}`);
      onlineUsers.delete(userId);
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date(),
      });
      io.emit('user:offline', { userId });
    });
  });
};