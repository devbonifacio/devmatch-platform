import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useScramble } from "../hooks/useScramble";

export default function Groups() {
  const [groups, setGroups]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();
  const headingText = useScramble("Grupos", { duration: 900, delay: 80 });

  const fetchGroups = async () => {
    try {
      const res = await api.get("/groups");
      setGroups(res.data.groups || []);
    } catch (err) {
      console.error("Groups error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGroups(); }, []);

  const handleGroupCreated = (group) => {
    setGroups((prev) => [group, ...prev]);
    setShowCreate(false);
    navigate(`/groups/${group._id}`);
  };

  return (
    <div className="min-h-screen px-4 py-8 animate-page-enter">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold heading-gradient font-mono">{headingText}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {groups.length > 0 ? `${groups.length} grupo${groups.length !== 1 ? "s" : ""}` : "Os teus grupos aparecem aqui."}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, #4f6ef7 0%, #6366f1 100%)",
              boxShadow: "0 4px 16px rgba(79,110,247,0.35)",
            }}
          >
            <PlusIcon />
            <span className="hidden sm:inline">Criar</span>
          </button>
        </div>

        {showCreate && (
          <CreateGroupModal onClose={() => setShowCreate(false)} onCreated={handleGroupCreated} />
        )}

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <SkeletonGroup key={i} />)}</div>
        ) : groups.length === 0 ? (
          <EmptyGroups onCreateGroup={() => setShowCreate(true)} />
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <GroupCard
                key={group._id}
                group={group}
                onClick={() => navigate(`/groups/${group._id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Group Card ───────────────────────────────────────────────────────────── */
function GroupCard({ group, onClick }) {
  return (
    <button
      onClick={onClick}
      className="card-interactive group flex w-full items-center gap-4 p-4 text-left"
    >
      {/* Avatar */}
      <div
        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
        style={{
          background: group.avatar
            ? undefined
            : "linear-gradient(135deg, #4f6ef7 0%, #a855f7 100%)",
          boxShadow: "0 0 0 2px rgba(79,110,247,0.25)",
        }}
      >
        {group.avatar ? (
          <img src={group.avatar} alt={group.name} className="h-full w-full rounded-xl object-cover" />
        ) : (
          group.name?.[0]?.toUpperCase() || "G"
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white group-hover:text-brand-100 transition-colors">{group.name}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {group.members?.length || 0} membro{group.members?.length !== 1 ? "s" : ""}
          {group.description && ` · ${group.description}`}
        </p>
        {/* Member avatars */}
        <div className="mt-1.5 flex -space-x-1.5">
          {group.members?.slice(0, 5).map((m) => (
            <img
              key={m._id}
              src={m.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${m._id}`}
              alt={m.name}
              className="h-5 w-5 rounded-full object-cover ring-1 ring-dark-900"
              title={m.name}
            />
          ))}
          {(group.members?.length || 0) > 5 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-dark-600 text-[10px] font-bold text-slate-400 ring-1 ring-dark-900">
              +{group.members.length - 5}
            </span>
          )}
        </div>
      </div>

      <ChevronIcon className="flex-shrink-0 text-slate-700 transition-all duration-200 group-hover:text-brand-400 group-hover:translate-x-0.5" />
    </button>
  );
}

/* ── Create Group Modal ───────────────────────────────────────────────────── */
function CreateGroupModal({ onClose, onCreated }) {
  const [name, setName]         = useState("");
  const [desc, setDesc]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Nome obrigatório."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/groups", { name: name.trim(), description: desc.trim() });
      onCreated(res.data.group);
    } catch (err) {
      setError(err?.response?.data?.message || "Erro ao criar grupo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl"
        style={{ background: "#0c0c18", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <h2 className="font-semibold text-white">Criar grupo</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <XIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Nome do grupo *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: React Devs Portugal"
              className="input-field w-full"
              maxLength={100}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Descrição</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Sobre o que é este grupo?"
              rows={2}
              maxLength={500}
              className="input-field w-full resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #4f6ef7, #6366f1)" }}
            >
              {loading ? "A criar..." : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Empty & skeleton ─────────────────────────────────────────────────────── */
function EmptyGroups({ onCreateGroup }) {
  return (
    <div className="card p-10 text-center">
      <div className="mb-4 text-5xl">👥</div>
      <h2 className="text-xl font-bold text-white">Sem grupos ainda</h2>
      <p className="mt-2 text-sm text-slate-500">
        Cria um grupo ou espera ser convidado por outro dev.
      </p>
      <button onClick={onCreateGroup} className="btn-primary mt-6 px-6 py-2.5 text-sm">
        Criar primeiro grupo
      </button>
    </div>
  );
}

function SkeletonGroup() {
  return (
    <div className="card flex animate-pulse items-center gap-4 p-4">
      <div className="h-12 w-12 flex-shrink-0 rounded-xl bg-dark-600" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-28 rounded bg-dark-600" />
        <div className="h-3 w-40 rounded bg-dark-600" />
      </div>
    </div>
  );
}

/* ── Icons ────────────────────────────────────────────────────────────────── */
function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
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
function XIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
