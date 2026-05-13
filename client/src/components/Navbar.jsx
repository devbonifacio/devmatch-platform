import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useUnreadStore } from "../store/unreadStore";
import api from "../lib/api";

const NAV_LINKS = [
  { to: "/discover", label: "Discover", icon: CompassIcon, badge: null },
  { to: "/feed",     label: "Feed",     icon: GridIcon,    badge: null },
  { to: "/groups",   label: "Grupos",   icon: GroupsIcon,  badge: "groups" },
  { to: "/matches",  label: "Matches",  icon: HeartIcon,   badge: "matches" },
  { to: "/profile",  label: "Perfil",   icon: PersonIcon,  badge: null },
];

export default function Navbar() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, logout } = useAuthStore();

  const [unread, setUnread]       = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef(null);
  const { totalMatchUnread, totalGroupUnread } = useUnreadStore();

  const handleLogout = () => { logout(); navigate("/login"); };
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + "/");

  // Fetch notifications on mount and periodically
  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const res = await api.get("/notifications");
        setUnread(res.data.unreadCount || 0);
        setNotifications(res.data.notifications || []);
      } catch {}
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close notif panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openNotifs = async () => {
    setShowNotifs((v) => !v);
    if (unread > 0) {
      try {
        await api.put("/notifications/read-all");
        setUnread(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      } catch {}
    }
  };

  const handleNotifAction = async (notif, action) => {
    try {
      if (notif.type === "friend_request") {
        if (action === "accept") {
          await api.post(`/friends/accept/${notif.sender?._id}`);
          setNotifications((prev) =>
            prev.map((n) => n._id === notif._id ? { ...n, handled: true } : n)
          );
        } else {
          await api.post(`/friends/decline/${notif.sender?._id}`);
          setNotifications((prev) => prev.filter((n) => n._id !== notif._id));
        }
      } else if (notif.type === "group_invite") {
        if (action === "accept") {
          await api.post(`/groups/${notif.data?.groupId}/join`);
          setNotifications((prev) =>
            prev.map((n) => n._id === notif._id ? { ...n, handled: true } : n)
          );
          navigate(`/groups/${notif.data?.groupId}`);
          setShowNotifs(false);
        } else {
          await api.post(`/groups/${notif.data?.groupId}/decline`);
          setNotifications((prev) => prev.filter((n) => n._id !== notif._id));
        }
      }
    } catch {}
  };

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl"
      style={{
        background: "rgba(7,7,14,0.88)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 1px 0 rgba(0,0,0,0.5), 0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">

        {/* Logo */}
        <Link to="/discover" className="group flex items-center gap-2.5 flex-shrink-0">
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
          <span className="hidden font-bold text-white logo-glitch sm:inline">
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
        <nav className="flex items-center gap-0.5 overflow-x-auto">
          {NAV_LINKS.map(({ to, label, icon: Icon, badge }) => {
            const badgeCount =
              badge === "matches" ? totalMatchUnread() :
              badge === "groups"  ? totalGroupUnread() : 0;
            return (
              <Link
                key={to}
                to={to}
                className={`group relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 flex-shrink-0 ${
                  isActive(to) ? "text-white" : "text-slate-500 hover:text-slate-200"
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
                <div className="relative">
                  <Icon className={`h-4 w-4 transition-colors ${isActive(to) ? "text-brand-400" : "text-slate-600 group-hover:text-slate-400"}`} />
                  {badgeCount > 0 && (
                    <span
                      className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                      style={{ background: "#ef4444" }}
                    >
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </div>
                <span className="hidden md:inline">{label}</span>
                {isActive(to) && (
                  <span
                    className="absolute bottom-0 left-1/2 h-px -translate-x-1/2 rounded-full"
                    style={{ width: "60%", background: "linear-gradient(90deg, transparent, rgba(79,110,247,0.8), transparent)" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right area: notifications + user */}
        {user && (
          <div className="flex items-center gap-2 flex-shrink-0" ref={notifRef}>
            {/* Notification bell */}
            <div className="relative">
              <button
                onClick={openNotifs}
                className="relative rounded-xl p-2 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
              >
                <BellIcon />
                {unread > 0 && (
                  <span
                    className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: "#ef4444", fontSize: "9px" }}
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>

              {/* Notification dropdown */}
              {showNotifs && (
                <div
                  className="absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-2xl shadow-2xl"
                  style={{ background: "#0c0c18", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                    <span className="text-sm font-semibold text-white">Notificações</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="py-6 text-center text-sm text-slate-600">Sem notificações.</p>
                    ) : (
                      notifications.map((n) => (
                        <NotifItem
                          key={n._id}
                          notif={n}
                          onAction={handleNotifAction}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User avatar + name */}
            <div className="hidden items-center gap-2 sm:flex">
              <img
                src={user.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${user._id}`}
                alt={user.name}
                className="h-7 w-7 rounded-full object-cover"
                style={{ boxShadow: "0 0 0 2px rgba(79,110,247,0.35)" }}
              />
              <span className="max-w-[100px] truncate text-sm text-slate-400">{user.name}</span>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="rounded-xl px-3 py-1.5 text-sm text-slate-500 transition-all duration-200 hover:text-slate-200 active:scale-95"
              style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
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

/* ── Notification Item ─────────────────────────────────────────────────── */
function NotifItem({ notif, onAction }) {
  const isHandled = notif.handled || notif.read;

  const getTitle = () => {
    switch (notif.type) {
      case "friend_request": return `${notif.sender?.name || "Alguém"} quer ser teu amigo`;
      case "friend_accepted": return `${notif.sender?.name || "Alguém"} aceitou o teu pedido de amizade`;
      case "group_invite": return `${notif.sender?.name || "Alguém"} convidou-te para "${notif.data?.groupName || "um grupo"}"`;
      case "match": return `Novo match com ${notif.sender?.name || "alguém"}!`;
      default: return "Nova notificação";
    }
  };

  const showActions = !isHandled && (notif.type === "friend_request" || notif.type === "group_invite");

  return (
    <div
      className="flex gap-3 px-4 py-3"
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        background: notif.read ? "transparent" : "rgba(79,110,247,0.04)",
      }}
    >
      {notif.sender?.avatar ? (
        <img
          src={notif.sender.avatar}
          alt={notif.sender.name}
          className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-lg" style={{ background: "#1e1e3a" }}>
          {notif.type === "group_invite" ? "👥" : notif.type === "friend_request" ? "👤" : "❤️"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-300 leading-relaxed">{getTitle()}</p>
        {showActions && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => onAction(notif, "accept")}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #4f6ef7, #6366f1)" }}
            >
              Aceitar
            </button>
            <button
              onClick={() => onAction(notif, "decline")}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-400 transition-colors hover:text-slate-200"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              Recusar
            </button>
          </div>
        )}
        {notif.handled && (
          <p className="mt-0.5 text-[10px] text-green-400">Aceite</p>
        )}
      </div>
    </div>
  );
}

/* ── Inline icons ──────────────────────────────────────────────────────── */
function CompassIcon({ className = "" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" stroke="none" />
    </svg>
  );
}
function GridIcon({ className = "" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function GroupsIcon({ className = "" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
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
function BellIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
    </svg>
  );
}
