import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  withCredentials: true, // send httpOnly cookies automatically on every request
});

// ── Refresh token logic ────────────────────────────────────────────────────
// One in-flight refresh at a time; queue subsequent failures until it resolves.
let isRefreshing = false;
let refreshQueue = [];

function drainQueue(error) {
  refreshQueue.forEach((cb) => cb(error));
  refreshQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // Skip if it's already a retry, or if it's an auth endpoint that shouldn't loop
    if (
      error.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login') &&
      !original.url?.includes('/auth/logout')
    ) {
      if (isRefreshing) {
        // Wait for the in-flight refresh to complete, then retry the original request
        return new Promise((resolve, reject) => {
          refreshQueue.push((err) => {
            if (err) return reject(err);
            resolve(api(original));
          });
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        await api.post('/auth/refresh');
        isRefreshing = false;
        drainQueue(null);
        return api(original); // retry original request with fresh cookie
      } catch (refreshError) {
        isRefreshing = false;
        drainQueue(refreshError);
        // Signal the app to log the user out
        window.dispatchEvent(new CustomEvent('auth:session-expired'));
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;