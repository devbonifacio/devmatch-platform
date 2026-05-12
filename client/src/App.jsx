import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import AuroraBg from './components/AuroraBg';
import ParticlesBg from './components/ParticlesBg';
import SpotlightCursor from './components/SpotlightCursor';
import { AnimatedRoutes } from './components/PageTransition';
import Login from './pages/Login';
import Register from './pages/Register';
import Discover from './pages/Discover';
import Matches from './pages/Matches';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import Feed from './pages/Feed';
import Groups from './pages/Groups';
import GroupChat from './pages/GroupChat';
import { useAuthStore } from './store/authStore';
import { useNetworkStatus } from './hooks/useNetworkStatus';

export default function App() {
  const { user, isChecking, fetchMe, logout } = useAuthStore();
  const location = useLocation();
  const { isOnline } = useNetworkStatus();

  const isAuthPage = ['/login', '/register'].includes(location.pathname);

  // Restore session from httpOnly cookie on every page load
  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Global handler: api.js fires this when the refresh token is also expired
  useEffect(() => {
    const handleSessionExpired = () => logout();
    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, [logout]);

  // While the initial fetchMe is in flight, render nothing (avoids flash-to-login)
  if (isChecking) return null;

  return (
    <div className="flex h-screen flex-col bg-dark-900">
      <ParticlesBg />
      <AuroraBg variant="global" />
      <SpotlightCursor />

      <OfflineBanner isOnline={isOnline} />

      {user && !isAuthPage && <Navbar />}

      <main className="relative z-10 flex flex-1 flex-col min-h-0 overflow-x-hidden overflow-y-auto">
        <AnimatedRoutes location={location}>
          <Routes location={location}>
            <Route path="/" element={<Navigate to={user ? '/discover' : '/login'} replace />} />
            <Route path="/login"    element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route path="/discover"         element={<ProtectedRoute><Discover /></ProtectedRoute>} />
            <Route path="/matches"          element={<ProtectedRoute><Matches /></ProtectedRoute>} />
            <Route path="/chat/:matchId"    element={<ProtectedRoute><Chat /></ProtectedRoute>} />
            <Route path="/profile"          element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/feed"             element={<ProtectedRoute><Feed /></ProtectedRoute>} />
            <Route path="/groups"           element={<ProtectedRoute><Groups /></ProtectedRoute>} />
            <Route path="/groups/:groupId"  element={<ProtectedRoute><GroupChat /></ProtectedRoute>} />
          </Routes>
        </AnimatedRoutes>
      </main>
    </div>
  );
}

function OfflineBanner({ isOnline }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed left-0 right-0 top-0 z-[9999] flex justify-center"
      style={{
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
        transform: isOnline ? 'translateY(-100%)' : 'translateY(0)',
        opacity: isOnline ? 0 : 1,
      }}
    >
      <div className="flex items-center gap-2.5 bg-amber-500 px-5 py-2.5 text-sm font-semibold text-amber-950 shadow-lg">
        <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2 2l20 20M8.5 8.5A8.985 8.985 0 0 1 12 8c1.657 0 3.21.45 4.546 1.233M5.338 5.338A12.945 12.945 0 0 0 2 8c2.122 2.747 5.253 4.62 8.78 5.027M17.657 17.657A12.977 12.977 0 0 0 22 8a12.923 12.923 0 0 0-1.66-2.343M12 20l.01-.01" />
        </svg>
        Sem ligação à internet
      </div>
    </div>
  );
}