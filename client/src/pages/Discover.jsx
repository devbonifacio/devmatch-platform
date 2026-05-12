import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import DevCard from "../components/DevCard";
import { useScramble } from "../hooks/useScramble";

export default function Discover() {
  const [developers, setDevelopers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [matchedDev, setMatchedDev] = useState(null);
  const [showKeyHint, setShowKeyHint] = useState(false);
  const navigate = useNavigate();
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

    // Mostrar hint de teclado brevemente após carregar
    const timer = setTimeout(() => {
      setShowKeyHint(true);
      setTimeout(() => setShowKeyHint(false), 3000);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleAction = useCallback(async (type, userId) => {
    const dev = developers.find((d) => d._id === userId);

    setDevelopers((prev) => prev.filter((d) => d._id !== userId));

    try {
      const res = await api.post(`/matches/${type}/${userId}`);

      if (type === "like") {
        if (res.data.matched) {
          setMatchedDev(dev || null);
        } else {
          showToast("Like enviado! 🔥", "like");
        }
      }
    } catch (err) {
      console.error("Action error:", err?.response?.data || err);
      showToast("Erro ao processar. Tenta novamente.", "error");
      if (dev) {
        setDevelopers((prev) => [dev, ...prev]);
      }
    }
  }, [developers]);

  // Keyboard shortcuts: → like, ← skip
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (matchedDev) return;

      const currentDev = developers[0];
      if (!currentDev) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        handleAction("like", currentDev._id);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleAction("skip", currentDev._id);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [developers, matchedDev, handleAction]);

  const currentDev = developers[0];
  const nextDev = developers[1];

  return (
    <div className="min-h-screen px-6 py-10 animate-page-enter">
      <div className="mx-auto max-w-lg">
        <div className="mb-8">
          <h1 className="text-3xl font-bold heading-gradient font-mono">{headingText}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Encontra devs para criar projetos incríveis.
          </p>
        </div>

        {/* Toast */}
        <div
          className="pointer-events-none fixed left-1/2 top-6 z-50 -translate-x-1/2"
          style={{
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            opacity: toast ? 1 : 0,
            transform: toast
              ? "translateX(-50%) translateY(0)"
              : "translateX(-50%) translateY(-16px)",
          }}
        >
          {toast && (
            <div
              className={`rounded-2xl px-5 py-3 text-sm font-semibold shadow-lg backdrop-blur-sm ${
                toast.type === "like"
                  ? "bg-brand-500 text-white"
                  : "bg-dark-700 text-slate-300"
              }`}
            >
              {toast.message}
            </div>
          )}
        </div>

        {/* Keyboard hint */}
        <div
          className="pointer-events-none fixed bottom-24 left-1/2 z-40 -translate-x-1/2"
          style={{
            transition: "all 0.4s ease",
            opacity: showKeyHint ? 1 : 0,
            transform: showKeyHint
              ? "translateX(-50%) translateY(0)"
              : "translateX(-50%) translateY(8px)",
          }}
        >
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-dark-800/90 px-5 py-3 text-xs text-slate-400 shadow-xl backdrop-blur-sm">
            <KeyIcon label="←" /> Skip
            <span className="text-slate-700">·</span>
            <KeyIcon label="→" /> Like
          </div>
        </div>

        {/* Match modal */}
        {matchedDev && (
          <MatchModal
            dev={matchedDev}
            onChat={() => navigate("/matches")}
            onContinue={() => setMatchedDev(null)}
          />
        )}

        {/* Cards */}
        {loading ? (
          <SkeletonCard />
        ) : currentDev ? (
          <div className="relative">
            {/* Background card (next in queue) */}
            {nextDev && (
              <div
                className="card absolute inset-x-5 top-4 opacity-30"
                style={{ zIndex: 0, height: "80px" }}
              />
            )}
            {developers[2] && (
              <div
                className="card absolute inset-x-8 top-2 opacity-15"
                style={{ zIndex: 0, height: "60px" }}
              />
            )}
            <div style={{ position: "relative", zIndex: 1 }}>
              <DevCard
                key={currentDev._id}
                dev={currentDev}
                onLike={(id) => handleAction("like", id)}
                onSkip={(id) => handleAction("skip", id)}
              />
            </div>
          </div>
        ) : (
          <EmptyState onRefresh={fetchDevelopers} />
        )}

        {/* Queue indicator dots */}
        {!loading && developers.length > 1 && (
          <div className="mt-5 flex items-center justify-center gap-1.5">
            {developers.slice(0, Math.min(developers.length, 6)).map((_, i) => (
              <span
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === 0 ? "20px" : "6px",
                  height: "6px",
                  background: i === 0 ? "rgba(79,110,247,0.9)" : "rgba(255,255,255,0.12)",
                }}
              />
            ))}
            {developers.length > 6 && (
              <span className="ml-1 text-xs text-slate-600">+{developers.length - 6}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Key hint badge ──────────────────────────────────────────────────── */
function KeyIcon({ label }) {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-white/5 font-mono text-xs font-bold text-slate-300">
      {label}
    </span>
  );
}

/* ── Match Modal ─────────────────────────────────────────────────────── */
function MatchModal({ dev, onChat, onContinue }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
      <div
        className="card w-full max-w-sm overflow-hidden text-center"
        style={{ animation: "matchPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
      >
        <div className="relative flex justify-center py-8">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background: "radial-gradient(circle at 50% 0%, #4f6ef7 0%, transparent 70%)",
            }}
          />
          <img
            src={dev?.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${dev?._id}`}
            alt={dev?.name}
            className="relative z-10 h-20 w-20 rounded-full object-cover ring-4 ring-brand-500/40"
          />
        </div>

        <div className="px-6 pb-6 pt-2">
          <p className="text-3xl">🎉</p>
          <h2 className="mt-1 text-2xl font-bold text-white">É um Match!</h2>
          <p className="mt-2 text-sm text-slate-400">
            Tu e <span className="font-semibold text-white">{dev?.name}</span> deram like um no outro.
          </p>

          {dev?.stack?.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {dev.stack.slice(0, 4).map((t) => (
                <span key={t} className="tech-badge">{t}</span>
              ))}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button onClick={onContinue} className="btn-secondary flex-1 py-3 text-sm">
              Continuar
            </button>
            <button onClick={onChat} className="btn-primary flex-1 py-3 text-sm">
              Ver Matches →
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes matchPop {
          from { transform: translateY(30px) scale(0.94); opacity: 0; }
          to   { transform: translateY(0)     scale(1);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="card mx-auto max-w-md animate-pulse overflow-hidden">
      <div className="h-72 w-full bg-dark-600" />
      <div className="p-5">
        <div className="mb-3 h-4 w-32 rounded bg-dark-600" />
        <div className="mb-4 flex gap-2">
          <div className="h-6 w-16 rounded-lg bg-dark-600" />
          <div className="h-6 w-20 rounded-lg bg-dark-600" />
        </div>
        <div className="flex gap-3">
          <div className="h-11 flex-1 rounded-xl bg-dark-600" />
          <div className="h-11 flex-1 rounded-xl bg-dark-600" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onRefresh }) {
  return (
    <div className="card p-10 text-center">
      <div className="mb-4 text-5xl">🚀</div>
      <h2 className="text-xl font-bold text-white">Sem perfis por agora</h2>
      <p className="mt-2 text-sm text-slate-500">
        Volta mais tarde para novos devs aparecerem.
      </p>
      <button onClick={onRefresh} className="btn-secondary mt-6 px-6 py-2.5 text-sm">
        Tentar novamente
      </button>
    </div>
  );
}
