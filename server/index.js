import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import matchRoutes from './routes/matches.js';
import createMessageRouter from './routes/messages.js';
import { setupSocket } from './socket/index.js';
import User from './models/User.js';
import {
  helmetMiddleware,
  globalRateLimit,
  globalErrorHandler,
} from './middleware/security.js';

dotenv.config();

// Warn at startup if JWT_SECRET is too short — minimum 64 chars recommended
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64) {
  console.warn('⚠️  JWT_SECRET is missing or shorter than 64 characters. Set a strong secret in .env.');
}

const app = express();
const httpServer = createServer(app);

const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:5173';

// Socket.io — cookie-based auth, same CORS policy as REST
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ── Security middlewares (order matters) ─────────────────────────────────
app.use(helmetMiddleware);

app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
}));

// Payload cap — base64 images up to ~5 MB, audio up to ~3 MB
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Strip MongoDB operators ($, .) from req.body / req.query / req.params
app.use(mongoSanitize());

// Global IP-based rate limit (100 req / 15 min)
app.use(globalRateLimit);

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/messages', createMessageRouter(io));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'DevMatch API is running' });
});

// ── Global error handler (must be last) ──────────────────────────────────
app.use(globalErrorHandler);

// ── Database + server start ───────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');

    try {
      await mongoose.connection.collection('matches').dropIndex('users_1');
      console.log('✅ Dropped conflicting unique index on matches.users');
    } catch (_) {
      // Index doesn't exist — safe to ignore
    }

    const { default: Match } = await import('./models/Match.js');
    await Match.syncIndexes();

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