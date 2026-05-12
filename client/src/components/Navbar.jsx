import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

const NAV_LINKS = [
  { to: "/discover", label: "Discover", icon: CompassIcon },
  { to: "/matches",  label: "Matches",  icon: HeartIcon   },
  { to: "/profile",  label: "Perfil",   icon: PersonIcon  },
];

export default function Navbar() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, logout } = useAuthStore();

  const handleLogout = () => { logout(); navigate("/login"); };
  const isActive = (path) => location.pathname === path;

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl"
      style={{
        background: "rgba(7,7,14,0.88)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 1px 0 rgba(0,0,0,0.5), 0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">

        {/* Logo with glitch */}
        <Link to="/discover" className="group flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black text-white"
            style={{
              background: "linear-gradient(135deg, #4f6ef7 0%, #6366f1 100%)",
              boxShadow: "0 0 16px rgba(79,110,247,0.45), inset 0 1px 0 rgba(255,255,255,0.2)",
              transition: "box-shadow 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 0 30px rgba(79,110,247,0.7), 0 0 60px rgba(79,110,247,0.3), inset 0 1px 0 rgba(255,255,255,0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 0 16px rgba(79,110,247,0.45), inset 0 1px 0 rgba(255,255,255,0.2)";
            }}
          >
            D
          </span>
          <span className="font-bold text-white logo-glitch">
            Dev<span
              style={{
                background: "linear-gradient(135deg, #818cf8, #c7d2fe)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Match
            </span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {NAV_LINKS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`group relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                isActive(to)
                  ? "text-white"
                  : "text-slate-500 hover:text-slate-200"
              }`}
              style={
                isActive(to)
                  ? {
                      background: "linear-gradient(135deg, rgba(79,110,247,0.18) 0%, rgba(79,110,247,0.07) 100%)",
                      boxShadow: "inset 0 1px 0 rgba(79,110,247,0.25), 0 0 0 1px rgba(79,110,247,0.2)",
                    }
                  : {}
              }
              onMouseEnter={(e) => {
                if (!isActive(to)) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.06)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive(to)) {
                  e.currentTarget.style.background = "";
                  e.currentTarget.style.boxShadow = "";
                }
              }}
            >
              <Icon
                className={`h-4 w-4 transition-colors ${
                  isActive(to) ? "text-brand-400" : "text-slate-600 group-hover:text-slate-400"
                }`}
              />
              <span className="hidden sm:inline">{label}</span>

              {/* Active underline glow */}
              {isActive(to) && (
                <span
                  className="absolute bottom-0 left-1/2 h-px -translate-x-1/2 rounded-full"
                  style={{
                    width: "60%",
                    background: "linear-gradient(90deg, transparent, rgba(79,110,247,0.8), transparent)",
                  }}
                />
              )}
            </Link>
          ))}
        </nav>

        {/* User area */}
        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <div className="relative">
                <img
                  src={user.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${user._id}`}
                  alt={user.name}
                  className="h-7 w-7 rounded-full object-cover"
                  style={{ boxShadow: "0 0 0 2px rgba(79,110,247,0.35)" }}
                />
              </div>
              <span className="max-w-[120px] truncate text-sm text-slate-400">
                {user.name}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-xl px-3.5 py-1.5 text-sm text-slate-500 transition-all duration-200 hover:text-slate-200 active:scale-95"
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.03)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(248,113,113,0.35)";
                e.currentTarget.style.background  = "rgba(248,113,113,0.07)";
                e.currentTarget.style.color       = "rgba(248,113,113,1)";
                e.currentTarget.style.boxShadow   = "0 0 14px rgba(248,113,113,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                e.currentTarget.style.background  = "rgba(255,255,255,0.03)";
                e.currentTarget.style.color       = "";
                e.currentTarget.style.boxShadow   = "";
              }}
            >
              Sair
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/* ── Inline icons ────────────────────────────────────────────────────────── */
function CompassIcon({ className = "" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" stroke="none" />
    </svg>
  );
}

function HeartIcon({ className = "" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function PersonIcon({ className = "" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
