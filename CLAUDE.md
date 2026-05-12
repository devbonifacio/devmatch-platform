# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DevMatch is a developer matching platform (Tinder-style) where programmers can discover each other by tech stack, swipe/like/skip, match mutually, and chat in real-time. It is a JavaScript monorepo with a React frontend (`client/`) and an Express backend (`server/`).

## Development Commands

### Backend (`server/`)
```bash
cd server
npm run dev    # Start with nodemon hot-reload on port 5000
npm start      # Run with node (production)
```

### Frontend (`client/`)
```bash
cd client
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # Production build
npm run preview  # Preview production build
```

The Vite dev server proxies `/api/*` requests to `http://localhost:5000`, so both services must be running during development.

## Architecture

### Directory Structure
```
devmatch/
├── client/src/
│   ├── pages/        # Route-level components (Login, Register, Discover, Matches, Chat, Profile)
│   ├── components/   # Reusable UI (Navbar, DevCard, ChatWindow, ProtectedRoute)
│   ├── store/        # Zustand auth store (token, user, login, register, logout, fetchMe)
│   ├── lib/          # Axios instance with JWT Bearer interceptor
│   └── App.jsx       # React Router setup with ProtectedRoute wrapper
│
└── server/
    ├── index.js       # Express app entry: DB connection, route mounting, Socket.io init
    ├── routes/        # auth.js, users.js, matches.js, messages.js
    ├── models/        # Mongoose schemas: User, Match, Message
    ├── middleware/    # auth.js — JWT protect middleware
    └── socket/        # index.js — Socket.io event handlers
```

### Data Flow
1. Auth state lives in Zustand; JWT is persisted to `localStorage`.
2. The Axios client in `client/src/lib/` auto-attaches `Authorization: Bearer <token>` to every request.
3. Backend `middleware/auth.js` validates the JWT on all protected routes.
4. Real-time chat goes through Socket.io (not REST); the same JWT is passed on the Socket.io handshake for authentication.
5. The REST `POST /api/messages/:matchId` endpoint exists as a fallback but normal message flow uses `chat:message` socket events.

### Key Models
- **User** — profile fields, `liked[]` and `skipped[]` arrays for swipe history, `isOnline` / `lastSeen` presence fields.
- **Match** — a two-element `users` array created automatically when two users mutually like each other.
- **Message** — tied to a `matchId`, includes `sender`, `text`, and a `read` flag.

### Real-time (Socket.io) Events
| Event | Direction | Purpose |
|---|---|---|
| `chat:join` | client → server | Enter a match room |
| `chat:message` | bidirectional | Send/receive a message |
| `chat:typing` | client → server | Typing indicator broadcast |
| `chat:leave` | client → server | Leave room |
| `user:online` / `user:offline` | client → server | Presence updates |

### Environment
The backend requires a `.env` file at `server/.env`:
```
MONGODB_URI=...
JWT_SECRET=...
PORT=5000
CLIENT_URL=http://localhost:5173
```

## API Endpoints (all under `/api`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Create account |
| POST | `/auth/login` | — | Returns JWT + user |
| GET | `/auth/me` | ✓ | Current user |
| PUT | `/users/profile` | ✓ | Update profile |
| GET | `/users/discover` | ✓ | 20 devs to swipe (excludes self, liked, skipped) |
| GET | `/users/:id` | ✓ | Public profile |
| POST | `/matches/like/:id` | ✓ | Like; auto-creates Match if mutual |
| POST | `/matches/skip/:id` | ✓ | Skip |
| GET | `/matches` | ✓ | All matches for current user |
| GET | `/messages/:matchId` | ✓ | Fetch history + mark read |
| POST | `/messages/:matchId` | ✓ | Send message (fallback) |
