import { useState, useEffect } from "react";

/**
 * useNetworkStatus
 *
 * Devolve `{ isOnline }`.
 * - `isOnline = true`  — utilizador tem ligação
 * - `isOnline = false` — utilizador está offline
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return { isOnline };
}
