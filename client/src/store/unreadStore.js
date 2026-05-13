import { create } from 'zustand';

// Armazena contadores de mensagens não lidas por matchId e groupId
export const useUnreadStore = create((set, get) => ({
  // { [matchId]: count }
  matchUnread: {},
  // { [groupId]: count }
  groupUnread: {},

  incrementMatch: (matchId) =>
    set((s) => ({
      matchUnread: { ...s.matchUnread, [matchId]: (s.matchUnread[matchId] || 0) + 1 },
    })),

  incrementGroup: (groupId) =>
    set((s) => ({
      groupUnread: { ...s.groupUnread, [groupId]: (s.groupUnread[groupId] || 0) + 1 },
    })),

  clearMatch: (matchId) =>
    set((s) => {
      const next = { ...s.matchUnread };
      delete next[matchId];
      return { matchUnread: next };
    }),

  clearGroup: (groupId) =>
    set((s) => {
      const next = { ...s.groupUnread };
      delete next[groupId];
      return { groupUnread: next };
    }),

  totalMatchUnread: () => Object.values(get().matchUnread).reduce((a, b) => a + b, 0),
  totalGroupUnread: () => Object.values(get().groupUnread).reduce((a, b) => a + b, 0),
}));

// Toca som de notificação usando Web Audio API (sem ficheiro externo)
export function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch {}
}
