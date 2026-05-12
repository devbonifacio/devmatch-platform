import { create } from 'zustand';
import api from '../lib/api';

export const useAuthStore = create((set) => ({
  user: null,
  loading: false,
  // true while the initial fetchMe is in flight — prevents flash-to-login on load
  isChecking: true,

  fetchMe: async () => {
    try {
      const res = await api.get('/auth/me');
      set({ user: res.data.user, isChecking: false });
    } catch {
      set({ user: null, isChecking: false });
    }
  },

  login: async (email, password) => {
    set({ loading: true });
    try {
      const res = await api.post('/auth/login', { email, password });
      set({ user: res.data.user, loading: false });
      return { success: true };
    } catch (error) {
      set({ loading: false });
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed.',
        status: error.response?.status,
      };
    }
  },

  register: async (payload) => {
    set({ loading: true });
    try {
      const res = await api.post('/auth/register', payload);
      set({ user: res.data.user, loading: false });
      return { success: true };
    } catch (error) {
      set({ loading: false });
      return {
        success: false,
        message: error.response?.data?.message || 'Registration failed.',
      };
    }
  },

  logout: async () => {
    // Clear state immediately so the UI reacts instantly
    set({ user: null });
    try {
      await api.post('/auth/logout');
    } catch { /* cookie expires naturally if request fails */ }
  },

  setUser: (user) => set({ user }),
}));