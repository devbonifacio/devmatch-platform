import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useScramble } from "../hooks/useScramble";

export default function Matches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const headingText = useScramble("Matches", { duration: 900, delay: 80 });

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const res = await api.get("/matches");
        setMatches(res.data.matches || []);
      } catch (err) {
        console.error("Matches fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchMatches();
  }, []);

  // Filtrar matches por nome ou tecnologia
  const filteredMatches = useMemo(() => {
    if (!search.trim()) return matches;
    const q = search.toLowerCase().trim();
    return matches.filter((m) => {
      const other = m.users?.find((u) => u._id !== m.currentUserId) || m.users?.[0];
      if (!other) return false;
      const nameMatch  = other.name?.toLowerCase().includes(q);
      const stackMatch = other.stack?.some((t) => t.toLowerCase().includes(q));
      return nameMatch || stackMatch;
    });
  }, [matches, search]);

  if (loading) {
    return (
      <div className="min-h-screen px-6 py-10 animate-page-enter">
        <div className="mx-auto max-w-lg">
          <div className="mb-8">
            <h1 className="text-3xl font-bold heading-gradient font-mono">{headingText}</h1>
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <SkeletonMatch key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10 animate-page-enter">
      <div className="mx-auto max-w-lg">
        <div className="mb-6">
          <h1 className="text-3xl font-bold heading-gradient font-mono">{headingText}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {matches.length > 0
              ? `${matches.length} match${matches.length !== 1 ? "es" : ""}`
              : "Os teus matches aparecem aqui."}
          </p>
        </div>

        {/* Campo de pesquisa */}
        {matches.length > 0 && (
          <div className="relative mb-5">
            <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Pesquisar por nome ou tecnologia..."
              className="input-field pl-10 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
              >
                <XSmallIcon />
              </button>
            )}
          </div>
        )}

        {matches.length === 0 ? (
          <EmptyMatches />
        ) : filteredMatches.length === 0 ? (
          <NoSearchResults query={search} onClear={() => setSearch("")} />
        ) : (
          <div className="space-y-3">
            {filteredMatches.map((match) => (
              <MatchCard
                key={match._id}
                match={match}
                onClick={() => navigate(`/chat/${match._id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Match Card ──────────────────────────────────────────────────────── */
function MatchCard({ match, onClick }) {
  const other = match.users?.find((u) => u._id !== match.currentUserId) || match.users?.[0];

  if (!other) return null;

  return (
    <button
      onClick={onClick}
      className="card-interactive group flex w-full items-center gap-4 p-4 text-left"
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <img
          src={other.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${other._id}`}
          alt={other.name}
          className={`h-12 w-12 rounded-full object-cover ring-2 transition-all duration-200 ${
            other.isOnline ? "ring-green-400/40" : "ring-white/[0.06]"
          }`}
        />
        {other.isOnline && (
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-dark-800 bg-green-400" style={{ boxShadow: "0 0 6px rgba(74,222,128,0.6)" }} />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-white group-hover:text-brand-100 transition-colors">{other.name}</p>
          {other.isOnline ? (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              online
            </span>
          ) : null}
        </div>
        {other.stack?.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {other.stack.slice(0, 4).join(" · ")}
          </p>
        )}
        {other.bio && (
          <p className="mt-0.5 truncate text-xs text-slate-600">{other.bio}</p>
        )}
      </div>

      {/* Chevron */}
      <ChevronIcon className="flex-shrink-0 text-slate-700 transition-all duration-200 group-hover:text-brand-400 group-hover:translate-x-0.5" />
    </button>
  );
}

/* ── Empty & search states ───────────────────────────────────────────── */
function EmptyMatches() {
  return (
    <div className="card p-10 text-center">
      <div className="mb-4 text-5xl">💬</div>
      <h2 className="text-xl font-bold text-white">Ainda sem matches</h2>
      <p className="mt-2 text-sm text-slate-500">
        Dá likes a outros devs para conseguir matches e começar a conversar.
      </p>
    </div>
  );
}

function NoSearchResults({ query, onClear }) {
  return (
    <div className="card p-8 text-center">
      <div className="mb-3 text-3xl">🔍</div>
      <p className="font-semibold text-white">Sem resultados para "{query}"</p>
      <p className="mt-1 text-sm text-slate-500">Tenta outro nome ou tecnologia.</p>
      <button onClick={onClear} className="btn-secondary mt-5 text-sm">
        Limpar pesquisa
      </button>
    </div>
  );
}

function SkeletonMatch() {
  return (
    <div className="card flex animate-pulse items-center gap-4 p-4">
      <div className="h-12 w-12 flex-shrink-0 rounded-full bg-dark-600" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-28 rounded bg-dark-600" />
        <div className="h-3 w-40 rounded bg-dark-600" />
      </div>
    </div>
  );
}

/* ── Icons ───────────────────────────────────────────────────────────── */
function SearchIcon({ className = "" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8" />
      <path strokeLinecap="round" d="m21 21-4.35-4.35" />
    </svg>
  );
}

function XSmallIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ChevronIcon({ className = "" }) {
  return (
    <svg className={`h-4 w-4 ${className}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
    </svg>
  );
}
