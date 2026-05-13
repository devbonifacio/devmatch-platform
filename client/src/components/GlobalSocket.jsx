import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { useUnreadStore, playNotificationSound } from '../store/unreadStore';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

// Componente global: mantém uma ligação socket para notificações em background
// Toca som e incrementa badges quando chegam mensagens fora do chat ativo
export default function GlobalSocket() {
  const { user } = useAuthStore();
  const location = useLocation();
  const socketRef = useRef(null);
  const { incrementMatch, incrementGroup } = useUnreadStore();

  useEffect(() => {
    if (!user) return;

    const socket = io(SOCKET_URL, {
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });
    socketRef.current = socket;

    // Mensagem privada recebida
    socket.on('chat:message', (msg) => {
      const matchId = msg.matchId || msg._id;
      const currentPath = window.location.pathname;
      // Só notifica se não estiver nesse chat
      if (!currentPath.includes(matchId)) {
        const isMine = String(msg.sender?._id) === String(user._id);
        if (!isMine) {
          incrementMatch(String(matchId));
          playNotificationSound();
        }
      }
    });

    // Mensagem de grupo recebida
    socket.on('group:message', (msg) => {
      const groupId = String(msg.groupId);
      const currentPath = window.location.pathname;
      // Só notifica se não estiver nesse grupo
      if (!currentPath.includes(groupId)) {
        const isMine = String(msg.sender?._id) === String(user._id);
        if (!isMine) {
          incrementGroup(groupId);
          playNotificationSound();
        }
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return null;
}
