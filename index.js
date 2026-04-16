import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import matchRoutes from "./routes/matches.js";
import messageRoutes from "./routes/messages.js";
import { setupSocket } from "./socket/index.js";
import User from "./models/User.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Socket.io setup — allows real-time communication
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/messages', messageRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'DevMatch API is running' });
});

// Connect to MongoDB then start server
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');

    // Drop the unique multikey index on matches.users if it exists.
    // This index was incorrectly created as unique in older versions — it prevents
    // users from having more than one match and causes E11000 on match creation.
    try {
      await mongoose.connection.collection('matches').dropIndex('users_1');
      console.log('✅ Dropped conflicting unique index on matches.users');
    } catch (_) {
      // Index doesn't exist or was already non-unique — safe to ignore
    }

    // Recreate indexes as defined in the current schemas
    const { default: Match } = await import('./models/Match.js');
    await Match.syncIndexes();

    // Reset stale online status from previous server session
    await User.updateMany({ isOnline: true }, { isOnline: false, lastSeen: new Date() });
    setupSocket(io);

    const PORT = process.env.PORT || 5000;
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });