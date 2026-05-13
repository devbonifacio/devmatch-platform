import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useParams } from 'react-router-dom';
import api from '../lib/api';
import ChatWindow from '../components/ChatWindow';
import { useAuthStore } from '../store/authStore';
import { useUnreadStore } from '../store/unreadStore';

// Connect through the Vite proxy so the httpOnly cookie is sent on the same
// origin. In production both are served from the same domain.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

export default function Chat() {
  const { matchId } = useParams();
  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);

  const peerTypingTimer = useRef(null);
  const otherUserRef = useRef(null);
  const socketRef = useRef(null);

  const user = useAuthStore((state) => state.user);
  const { clearMatch } = useUnreadStore();

  // ── 1. Socket lifecycle — one socket per session ──────────────────────────
  useEffect(() => {
    if (!user) return;

    const s = io(SOCKET_URL, {
      withCredentials: true, // sends the httpOnly access_token cookie
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = s;

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  // ── 2. Room + listeners ───────────────────────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !matchId || !user) return;

    setMessages([]);
    setOtherUser(null);
    setIsOnline(false);
    setPeerTyping(false);
    setLoadingHistory(true);
    otherUserRef.current = null;
    // Limpa o badge de não-lidas ao entrar no chat
    clearMatch(String(matchId));

    const fetchMessages = async () => {
      try {
        const res = await api.get(`/messages/${matchId}`);
        const formatted = (res.data.messages || []).map((msg) => ({
          ...msg,
          isMine: String(msg.sender?._id) === String(user._id),
        }));
        setMessages(formatted);

        const theirMsg = (res.data.messages || []).find(
          (m) => String(m.sender?._id) !== String(user._id)
        );
        if (theirMsg?.sender) {
          otherUserRef.current = theirMsg.sender;
          setOtherUser(theirMsg.sender);
        }
      } catch (error) {
        console.error('Error fetching messages:', error);
      } finally {
        setLoadingHistory(false);
      }
    };

    const fetchMatchInfo = async () => {
      try {
        const res = await api.get('/matches');
        const match = (res.data.matches || []).find(
          (m) => String(m._id) === String(matchId)
        );
        if (match) {
          const other = match.users?.find(
            (u) => String(u._id) !== String(match.currentUserId)
          );
          if (other) {
            otherUserRef.current = other;
            setOtherUser((prev) => prev || other);
            setIsOnline(other.isOnline || false);
          }
        }
      } catch (_) {}
    };

    fetchMessages();
    fetchMatchInfo();

    const joinRoom = () => socket.emit('chat:join', String(matchId));
    socket.on('connect', joinRoom);
    if (socket.connected) joinRoom();

    const onMessage = (message) => {
      if (String(message.matchId) !== String(matchId)) return;
      setMessages((prev) => {
        if (prev.some((m) => String(m._id) === String(message._id))) return prev;
        return [
          ...prev,
          { ...message, isMine: String(message.sender?._id) === String(user._id) },
        ];
      });
      if (String(message.sender?._id) !== String(user._id) && message.sender) {
        setOtherUser((prev) => {
          if (prev) return prev;
          otherUserRef.current = message.sender;
          return message.sender;
        });
      }
    };

    const onTyping = ({ userId: typingUserId, isTyping }) => {
      if (String(typingUserId) === String(user._id)) return;
      setPeerTyping(isTyping);
      clearTimeout(peerTypingTimer.current);
      if (isTyping) {
        peerTypingTimer.current = setTimeout(() => setPeerTyping(false), 3000);
      }
    };

    const onUserOnline = ({ userId: onlineId }) => {
      if (otherUserRef.current && String(onlineId) === String(otherUserRef.current._id)) {
        setIsOnline(true);
      }
    };

    const onUserOffline = ({ userId: offlineId }) => {
      if (otherUserRef.current && String(offlineId) === String(otherUserRef.current._id)) {
        setIsOnline(false);
      }
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:typing', onTyping);
    socket.on('user:online', onUserOnline);
    socket.on('user:offline', onUserOffline);

    return () => {
      socket.emit('chat:leave', String(matchId));
      socket.off('connect', joinRoom);
      socket.off('chat:message', onMessage);
      socket.off('chat:typing', onTyping);
      socket.off('user:online', onUserOnline);
      socket.off('user:offline', onUserOffline);
      clearTimeout(peerTypingTimer.current);
    };
  }, [matchId, user]);

  // ── 3. Send message ───────────────────────────────────────────────────────
  // payload: { text?, image?, audio?, viewOnce? }
  const handleSend = async (payload) => {
    const body = typeof payload === 'string' ? { text: payload } : payload;
    const res = await api.post(`/messages/${matchId}`, body); // throws on error → caller shows toast
    const newMessage = { ...res.data.message, isMine: true };
    setMessages((prev) => {
      if (prev.some((m) => String(m._id) === String(newMessage._id))) return prev;
      return [...prev, newMessage];
    });
  };

  // Mark a viewOnce image as viewed by the current user
  const handleViewMessage = async (messageId) => {
    try {
      await api.post(`/messages/${matchId}/${messageId}/view`);
      setMessages((prev) =>
        prev.map((m) =>
          String(m._id) === String(messageId) ? { ...m, viewOnceViewed: true } : m
        )
      );
    } catch { /* ignore */ }
  };

  const handleTyping = (typing) => {
    socketRef.current?.emit('chat:typing', {
      matchId: String(matchId),
      isTyping: typing,
    });
  };

  return (
    <div className="flex h-full flex-col bg-dark-900">
      {loadingHistory ? (
        <ChatSkeleton />
      ) : (
        <ChatWindow
          messages={messages}
          onSend={handleSend}
          onTyping={handleTyping}
          onView={handleViewMessage}
          otherUser={otherUser}
          isOnline={isOnline}
          peerTyping={peerTyping}
          socket={socketRef.current}
          matchId={matchId}
          currentUser={user}
        />
      )}
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-center gap-3 bg-dark-800 px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="h-9 w-9 animate-pulse rounded-full bg-dark-600" />
        <div className="flex flex-col gap-1.5">
          <div className="h-3 w-24 animate-pulse rounded bg-dark-600" />
          <div className="h-2.5 w-16 animate-pulse rounded bg-dark-700" />
        </div>
      </div>
      <div className="flex-1 space-y-3 px-4 py-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className={`flex items-end gap-2 ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}
          >
            {i % 2 === 0 && (
              <div className="h-6 w-6 animate-pulse rounded-full bg-dark-600 flex-shrink-0" />
            )}
            <div
              className="animate-pulse rounded-2xl bg-dark-600"
              style={{ width: `${80 + (i % 4) * 50}px`, height: `${32 + (i % 2) * 12}px` }}
            />
          </div>
        ))}
      </div>
      <div
        className="bg-dark-800 px-4 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex gap-3">
          <div className="h-11 flex-1 animate-pulse rounded-xl bg-dark-700" />
          <div className="h-11 w-11 animate-pulse rounded-xl bg-dark-700" />
        </div>
      </div>
    </div>
  );
}