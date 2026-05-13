import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import DevCard from "../components/DevCard";
import { useScramble } from "../hooks/useScramble";

export default function Discover() {
  const [developers, setDevelopers]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [toast, setToast]               = useState(null);
  const [matchedDev, setMatchedDev]     = useState(null);
  const [showKeyHint, setShowKeyHint]   = useState(false);

  const [searchQuery, setSearchQuery]     = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isSearchMode, setIsSearchMode]   = useState(false);
  const [friendStatuses, setFriendStatuses] = useState({});

  const navigate    = useNavigate();
  const searchTimer = useRef(null);
  const headingText = useScramble("Discover", { duration: 1000, delay: 100 });

  const fetchDevelopers = async () => {
    setLoading(true);
    try {
      const res = await api.get("/users/discover");
      setDevelopers(res.data.users || []);
    } catch (err) {
      console.error("Discover fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevelopers();
    const timer = setTimeout(() => {
      setShowKeyHint(true);
      setTimeout(() => setShowKeyHint(false), 3000);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (!q.trim()) { setIsSearchMode(false); setSearchResults([]); return; }
    setIsSearchMode(true);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      if (q.length < 2) return;
      setSearchLoading(true);
      try {
        const res = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res.data.users || []);
      } catch {}
      setSearchLoading(false);
    }, 350);
  };

  const clearSearch = () => { setSearchQuery(""); setSearchResults([]); setIsSearchMode(false); };

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleAction = useCallback(async (type, userId) => {
    const dev = developers.find(d => d._id === userId);
    setDevelopers(prev => prev.filter(d => d._id !== userId));
    try {
      const res = await api.post(`/matches/${type}/${userId}`);
      if (type === "like" && res.data.matched) setMatchedDev(dev || null);
      else if (type === "like") showToast("Like enviado!", "like");
    } catch (err) {
      showToast("Erro ao processar. Tenta novamente.", "error");
      if (dev) setDevelopers(prev => [dev, ...prev]);
    }
  }, [developers]);

  const handleFriendRequest = async (userId) => {
    try {
      await api.post(`/friends/request/${userId}`);
      setFriendStatuses(prev => ({ ...prev, [userId]: "sent" }));
      showToast("Pedido de amizade enviado!", "like");
    } catch (err) {
      showToast(err?.response?.data?.message || "Erro ao enviar pedido.", "error");
    }
  };

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (matchedDev || isSearchMode) return;
      const currentDev = developers[0];
      if (!currentDev) return;
      if (e.key === "ArrowRight") { e.preventDefault(); handleAction("like", currentDev._id); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); handleAction("skip", currentDev._id); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [developers, matchedDev, handleAction, isSearchMode]);

  const currentDev = developers[0];
  const nextDev    = developers[1];

  // Recommendation badges: score > 0 means shared interests
  const suggestedDevs = developers.filter(d => (d._score || 0) > 0);

  return (
    <div className="min-h-screen px-6 py-10 animate-page-enter">
      <div className="mx-auto max-w-lg">
        <div className="mb-6">
          <h1 className="text-3xl font-bold heading-gradient font-mono">{headingText}</h1>
          <p className="mt-1 text-sm text-slate-500">Encontra devs para criar projetos incríveis.</p>
        </div>

        {/* Search bar */}
        <div className="relative mb-6">
          <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input type="text" value={searchQuery} onChange={handleSearchChange} placeholder="Pesquisar por nome..." className="input-field w-full pl-10 text-sm" />
          {searchQuery && (
            <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"><XIcon /></button>
          )}
        </div>

        {/* Toast */}
        <div className="pointer-events-none fixed left-1/2 top-6 z-50 -translate-x-1/2"
          style={{ transition: "all 0.3s cubic-bezier(0.34,1.56,0.64,1)", opacity: toast ? 1 : 0, transform: toast ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(-16px)" }}>
          {toast && (
            <div className={`rounded-2xl px-5 py-3 text-sm font-semibold shadow-lg backdrop-blur-sm ${toast.type === "like" ? "bg-brand-500 text-white" : "bg-dark-700 text-slate-300"}`}>
              {toast.message}
            </div>
          )}
        </div>

        {/* Keyboard hint */}
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-40 -translate-x-1/2"
          style={{ transition: "all 0.4s ease", opacity: showKeyHint && !isSearchMode ? 1 : 0, transform: showKeyHint && !isSearchMode ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(8px)" }}>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-dark-800/90 px-5 py-3 text-xs text-slate-400 shadow-xl backdrop-blur-sm">
            <KeyIcon label="←" /> Skip <span className="text-slate-700">·</span> <KeyIcon label="→" /> Like
          </div>
        </div>

        {/* Match modal */}
        {matchedDev && <MatchModal dev={matchedDev} onChat={() => navigate("/matches")} onContinue={() => setMatchedDev(null)} />}

        {/* Search results */}
        {isSearchMode ? (
          <div>
            {searchLoading ? (
              <div className="space-y-3">{[1, 2].map(i => <SearchSkeleton key={i} />)}</div>
            ) : searchResults.length === 0 ? (
              <div className="card p-8 text-center">
                <div className="mb-3 text-3xl">🔍</div>
                <p className="font-semibold text-white">Sem resultados para "{searchQuery}"</p>
                <p className="mt-1 text-sm text-slate-500">Tenta outro nome.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {searchResults.map(u => (
                  <SearchResultCard key={u._id} user={u} status={friendStatuses[u._id]} onFriendRequest={() => handleFriendRequest(u._id)} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {loading ? (
              <SkeletonCard />
            ) : currentDev ? (
              <>
                <div className="relative">
                  {nextDev && <div className="card absolute inset-x-5 top-4 opacity-30" style={{ zIndex: 0, height: "80px" }} />}
                  {developers[2] && <div className="card absolute inset-x-8 top-2 opacity-15" style={{ zIndex: 0, height: "60px" }} />}
                  <div style={{ position: "relative", zIndex: 1 }}>
                    <DevCard
                      key={currentDev._id}
                      dev={currentDev}
                      onLike={id => handleAction("like", id)}
                      onSkip={id => handleAction("skip", id)}
                      onFriendRequest={handleFriendRequest}
                      friendStatus={friendStatuses[currentDev._id]}
                      matchScore={currentDev._score}
                    />
                  </div>
                </div>

                {/* Deck dots */}
                {developers.length > 1 && (
                  <div className="mt-5 flex items-center justify-center gap-1.5">
                    {developers.slice(0, Math.min(developers.length, 6)).map((_, i) => (
                      <span key={i} className="rounded-full transition-all duration-300"
                        style={{ width: i === 0 ? "20px" : "6px", height: "6px", background: i === 0 ? "rgba(79,110,247,0.9)" : "rgba(255,255,255,0.12)" }} />
                    ))}
                    {developers.length > 6 && <span className="ml-1 text-xs text-slate-600">+{developers.length - 6}</span>}
                  </div>
                )}

                {/* "Pessoas que podes conhecer" — show others with shared interests */}
                {suggestedDevs.length > 1 && (
                  <div className="mt-8">
                    <div className="mb-3 flex items-center gap-2">
                      <SparkleIcon />
                      <h2 className="text-sm font-semibold text-slate-300">Pessoas que podes conhecer</h2>
                    </div>
                    <div className="space-y-2">
                      {suggestedDevs.slice(1, 5).map(dev => (
                        <SuggestedCard
                          key={dev._id}
                          dev={dev}
                          status={friendStatuses[dev._id]}
                          onLike={() => handleAction("like", dev._id)}
                          onFriend={() => handleFriendRequest(dev._id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <EmptyState onRefresh={fetchDevelopers} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Suggested Card ───────────────────────────────────────────────────────── */
function SuggestedCard({ dev, status, onLike, onFriend }) {
  return (
    <div className="card flex items-center gap-3 p-3">
      <img src={dev.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${dev._id}`} alt={dev.name} className="h-11 w-11 flex-shrink-0 rounded-full object-cover" style={{ boxShadow: "0 0 0 2px rgba(79,110,247,0.3)" }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{dev.name}</p>
        {dev.stack?.length > 0 && <p className="mt-0.5 truncate text-xs text-slate-500">{dev.stack.slice(0, 3).join(" · ")}</p>}
        {(dev._score || 0) > 0 && (
          <p className="mt-0.5 text-[11px] text-indigo-400">{dev._score} interesse{dev._score > 1 ? "s" : ""} em comum</p>
        )}
      </div>
      <div className="flex gap-2 flex-shrink-0">
        {status === "sent" ? (
          <span className="rounded-lg px-2 py-1 text-xs text-green-400 bg-green-500/10">Enviado</span>
        ) : status === "friend" ? (
          <span className="rounded-lg px-2 py-1 text-xs text-brand-400 bg-brand-500/10">Amigo</span>
        ) : (
          <>
            <button type="button" onClick={onFriend} className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:text-white transition-colors" style={{ background: "rgba(255,255,255,0.06)" }}>
              Amigo
            </button>
            <button type="button" onClick={onLike} className="rounded-lg px-2 py-1 text-xs font-semibold text-white transition-all active:scale-95" style={{ background: "linear-gradient(135deg,#4f6ef7,#6366f1)" }}>
              Like
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Search Result Card ───────────────────────────────────────────────────── */
function SearchResultCard({ user, status, onFriendRequest }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <img src={user.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${user._id}`} alt={user.name} className="h-12 w-12 flex-shrink-0 rounded-full object-cover" style={{ boxShadow: "0 0 0 2px rgba(79,110,247,0.3)" }} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white">{user.name}</p>
        {user.stack?.length > 0 && <p className="mt-0.5 truncate text-xs text-slate-500">{user.stack.slice(0, 4).join(" · ")}</p>}
        {user.bio && <p className="mt-0.5 truncate text-xs text-slate-600">{user.bio}</p>}
      </div>
      {status === "sent" ? (
        <span className="flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold text-green-400 bg-green-500/10">Enviado</span>
      ) : status === "friend" ? (
        <span className="flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold text-brand-400 bg-brand-500/10">Amigo</span>
      ) : (
        <button onClick={onFriendRequest} className="flex-shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white transition-all active:scale-95" style={{ background: "linear-gradient(135deg,#4f6ef7,#6366f1)" }}>
          <AddPersonIcon />Adicionar
        </button>
      )}
    </div>
  );
}

function KeyIcon({ label }) {
  return <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-white/5 font-mono text-xs font-bold text-slate-300">{label}</span>;
}

function MatchModal({ dev, onChat, onContinue }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
      <div className="card w-full max-w-sm overflow-hidden text-center" style={{ animation: "matchPop 0.4s cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <div className="relative flex justify-center py-8">
          <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 50% 0%,#4f6ef7 0%,transparent 70%)" }} />
          <img src={dev?.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${dev?._id}`} alt={dev?.name} className="relative z-10 h-20 w-20 rounded-full object-cover ring-4 ring-brand-500/40" />
        </div>
        <div className="px-6 pb-6 pt-2">
          <p className="text-3xl">🎉</p>
          <h2 className="mt-1 text-2xl font-bold text-white">É um Match!</h2>
          <p className="mt-2 text-sm text-slate-400">Tu e <span className="font-semibold text-white">{dev?.name}</span> deram like um no outro.</p>
          {dev?.stack?.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {dev.stack.slice(0, 4).map(t => <span key={t} className="tech-badge">{t}</span>)}
            </div>
          )}
          <div className="mt-6 flex gap-3">
            <button onClick={onContinue} className="btn-secondary flex-1 py-3 text-sm">Continuar</button>
            <button onClick={onChat} className="btn-primary flex-1 py-3 text-sm">Ver Matches →</button>
          </div>
        </div>
      </div>
      <style>{`@keyframes matchPop { from { transform: translateY(30px) scale(0.94); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }`}</style>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="card mx-auto max-w-md animate-pulse overflow-hidden">
      <div className="h-72 w-full bg-dark-600" />
      <div className="p-5">
        <div className="mb-3 h-4 w-32 rounded bg-dark-600" />
        <div className="mb-4 flex gap-2"><div className="h-6 w-16 rounded-lg bg-dark-600" /><div className="h-6 w-20 rounded-lg bg-dark-600" /></div>
        <div className="flex gap-3"><div className="h-11 flex-1 rounded-xl bg-dark-600" /><div className="h-11 flex-1 rounded-xl bg-dark-600" /></div>
      </div>
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="card flex animate-pulse items-center gap-4 p-4">
      <div className="h-12 w-12 flex-shrink-0 rounded-full bg-dark-600" />
      <div className="flex-1 space-y-2"><div className="h-3.5 w-28 rounded bg-dark-600" /><div className="h-3 w-40 rounded bg-dark-600" /></div>
      <div className="h-8 w-24 rounded-xl bg-dark-600" />
    </div>
  );
}

function EmptyState({ onRefresh }) {
  return (
    <div className="card p-10 text-center">
      <div className="mb-4 text-5xl">🚀</div>
      <h2 className="text-xl font-bold text-white">Sem perfis por agora</h2>
      <p className="mt-2 text-sm text-slate-500">Volta mais tarde para novos devs aparecerem.</p>
      <button onClick={onRefresh} className="btn-secondary mt-6 px-6 py-2.5 text-sm">Tentar novamente</button>
    </div>
  );
}

function SearchIcon({ className = "" }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" /></svg>;
}
function XIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
}
function AddPersonIcon() {
  return <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6" /></svg>;
}
function SparkleIcon() {
  return <svg className="h-4 w-4 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3l1.5 3.5L10 8l-3.5 1.5L5 13l-1.5-3.5L0 8l3.5-1.5L5 3zM19 11l1 2.5 2.5 1-2.5 1L19 18l-1-2.5L15.5 14.5l2.5-1L19 11zM12 1l.8 1.9L14.7 3l-1.9.8L12 5.7l-.8-1.9L9.3 3l1.9-.8L12 1z" /></svg>;
}
