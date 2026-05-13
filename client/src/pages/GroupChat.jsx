import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io as socketIO } from "socket.io-client";
import api from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { useUnreadStore } from "../store/unreadStore";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "";

export default function GroupChat() {
  const { groupId } = useParams();
  const { user }    = useAuthStore();
  const navigate    = useNavigate();
  const { clearGroup } = useUnreadStore();

  const [group, setGroup]         = useState(null);
  const [messages, setMessages]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [text, setText]           = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [showInvite, setShowInvite]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError]         = useState("");

  // Chamada de voz
  const [inVoice, setInVoice]           = useState(false);
  const [voiceParticipants, setVoiceParticipants] = useState([]);
  const [isMuted, setIsMuted]           = useState(false);

  const socketRef    = useRef(null);
  const bottomRef    = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnsRef   = useRef({});

  useEffect(() => {
    // Limpa badge de não-lidas ao entrar no grupo
    clearGroup(groupId);

    const socket = socketIO(SOCKET_URL, { withCredentials: true });
    socketRef.current = socket;

    socket.emit("group:join", groupId);

    socket.on("group:message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("group:voice-participants", ({ participants }) => {
      setVoiceParticipants(participants);
    });

    socket.on("group:voice-user-joined", ({ userId: uid, name, avatar }) => {
      setVoiceParticipants((prev) =>
        prev.find((p) => p.userId === uid) ? prev : [...prev, { userId: uid, name, avatar }]
      );
      if (localStreamRef.current && uid !== user?._id) createOffer(uid);
    });

    socket.on("group:voice-user-left", ({ userId: uid }) => {
      setVoiceParticipants((prev) => prev.filter((p) => p.userId !== uid));
      closePeer(uid);
    });

    socket.on("group:voice-offer", async ({ from, offer }) => {
      if (!localStreamRef.current) return;
      const pc = getOrCreatePeer(from);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("group:voice-answer", { groupId, to: from, answer });
    });

    socket.on("group:voice-answer", async ({ from, answer }) => {
      const pc = peerConnsRef.current[from];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("group:voice-ice", async ({ from, candidate }) => {
      const pc = peerConnsRef.current[from];
      if (pc && candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      }
    });

    (async () => {
      try {
        const [gRes, mRes] = await Promise.all([
          api.get(`/groups/${groupId}`),
          api.get(`/groups/${groupId}/messages`),
        ]);
        setGroup(gRes.data.group);
        setMessages(mRes.data.messages || []);
      } catch (err) {
        if (err?.response?.status === 403 || err?.response?.status === 404) navigate("/groups");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      socket.emit("group:leave", groupId);
      leaveVoice();
      socket.disconnect();
    };
  }, [groupId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Voz WebRTC ───────────────────────────────────────────────────────────
  const getOrCreatePeer = useCallback((remoteUserId) => {
    if (peerConnsRef.current[remoteUserId]) return peerConnsRef.current[remoteUserId];
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit("group:voice-ice", { groupId, to: remoteUserId, candidate: e.candidate });
    };
    pc.ontrack = (e) => playRemoteAudio(remoteUserId, e.streams[0]);
    peerConnsRef.current[remoteUserId] = pc;
    return pc;
  }, [groupId]);

  const createOffer = useCallback(async (remoteUserId) => {
    const pc = getOrCreatePeer(remoteUserId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current?.emit("group:voice-offer", { groupId, to: remoteUserId, offer });
  }, [groupId, getOrCreatePeer]);

  const closePeer = (uid) => {
    const pc = peerConnsRef.current[uid];
    if (pc) { pc.close(); delete peerConnsRef.current[uid]; }
    const el = document.getElementById(`audio-${uid}`);
    if (el) el.remove();
  };

  const playRemoteAudio = (uid, stream) => {
    let el = document.getElementById(`audio-${uid}`);
    if (!el) { el = document.createElement("audio"); el.id = `audio-${uid}`; el.autoplay = true; document.body.appendChild(el); }
    el.srcObject = stream;
  };

  const joinVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setInVoice(true);
      socketRef.current?.emit("group:voice-join", { groupId });
    } catch {
      showError("Não foi possível aceder ao microfone.");
    }
  };

  const leaveVoice = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    Object.keys(peerConnsRef.current).forEach(closePeer);
    peerConnsRef.current = {};
    socketRef.current?.emit("group:voice-leave", { groupId });
    setInVoice(false);
    setVoiceParticipants([]);
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
  };

  // ── Enviar mensagem ──────────────────────────────────────────────────────
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const draft = text.trim();
    setText("");
    try {
      await api.post(`/groups/${groupId}/messages`, { text: draft });
    } catch {
      setText(draft);
    }
  };

  // ── Convidar utilizador ──────────────────────────────────────────────────
  const handleInvite = async (userId) => {
    try {
      await api.post(`/groups/${groupId}/invite/${userId}`);
      return true;
    } catch (err) {
      throw new Error(err?.response?.data?.message || "Erro ao convidar.");
    }
  };

  // ── Sair do grupo ────────────────────────────────────────────────────────
  const handleLeaveGroup = async () => {
    if (!window.confirm("Tens a certeza que queres sair do grupo?")) return;
    try {
      await api.delete(`/groups/${groupId}/leave`);
      navigate("/groups");
    } catch (err) {
      showError(err?.response?.data?.message || "Erro ao sair do grupo.");
    }
  };

  // ── Apagar grupo ─────────────────────────────────────────────────────────
  const handleDeleteGroup = async () => {
    if (!window.confirm(`Apagar o grupo "${group?.name}"? Esta ação é irreversível.`)) return;
    try {
      await api.delete(`/groups/${groupId}`);
      navigate("/groups");
    } catch (err) {
      showError(err?.response?.data?.message || "Erro ao apagar o grupo.");
    }
  };

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(""), 3000);
  };

  const showToast = (msg) => {
    setError("✓ " + msg);
    setTimeout(() => setError(""), 2500);
  };

  if (loading) return <GroupChatSkeleton />;
  if (!group) return null;

  const myId = user?._id;
  const isCreator = (group.creator?._id || group.creator) === myId;
  const isAdmin   = group.admins?.some((a) => (a._id || a) === myId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toast / erro */}
      {error && (
        <div
          className="pointer-events-none fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-2xl px-5 py-2.5 text-sm font-semibold shadow-lg backdrop-blur-sm"
          style={{
            background: error.startsWith("✓") ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)",
            color: "white",
          }}
        >
          {error.replace("✓ ", "")}
        </div>
      )}

      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(7,7,14,0.7)", backdropFilter: "blur(16px)" }}
      >
        <button onClick={() => navigate("/groups")} className="mr-1 text-slate-500 hover:text-slate-300 transition-colors">
          <BackIcon />
        </button>

        {/* Avatar clicável para definições (criador) */}
        <button
          type="button"
          onClick={() => isCreator && setShowSettings(true)}
          className={`relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white ${isCreator ? "cursor-pointer" : "cursor-default"}`}
          style={{ background: "linear-gradient(135deg, #4f6ef7, #a855f7)" }}
          title={isCreator ? "Editar grupo" : undefined}
        >
          {group.avatar ? (
            <img src={group.avatar} alt={group.name} className="h-full w-full rounded-xl object-cover" />
          ) : (
            group.name?.[0]?.toUpperCase()
          )}
          {isCreator && (
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[9px] text-white">
              ✎
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white truncate">{group.name}</p>
          <p className="text-xs text-slate-500">{group.members?.length} membros</p>
        </div>

        <div className="flex items-center gap-1">
          {/* Voz */}
          <button
            onClick={inVoice ? leaveVoice : joinVoice}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              inVoice ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-green-500/15 text-green-400 hover:bg-green-500/25"
            }`}
          >
            <MicIcon />
            <span className="hidden sm:inline">{inVoice ? "Sair" : "Voz"}</span>
          </button>

          {/* Membros */}
          <button
            onClick={() => setShowMembers(true)}
            className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
          >
            <PeopleIcon />
          </button>

          {/* Sair / Apagar */}
          {isCreator ? (
            <button
              onClick={handleDeleteGroup}
              className="rounded-xl p-2 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
              title="Apagar grupo"
            >
              <TrashIcon />
            </button>
          ) : (
            <button
              onClick={handleLeaveGroup}
              className="rounded-xl p-2 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
              title="Sair do grupo"
            >
              <LeaveIcon />
            </button>
          )}
        </div>
      </div>

      {/* Canal de voz */}
      {(inVoice || voiceParticipants.length > 0) && (
        <VoiceChannelBar
          participants={voiceParticipants}
          myId={myId}
          inVoice={inVoice}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          onLeave={leaveVoice}
          onJoin={joinVoice}
        />
      )}

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-600">Ainda sem mensagens. Sê o primeiro!</p>
          </div>
        )}
        {messages.map((msg) => (
          <GroupMessageBubble key={msg._id} msg={msg} myId={myId} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="flex-shrink-0 px-4 py-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(7,7,14,0.6)", backdropFilter: "blur(16px)" }}
      >
        <form onSubmit={sendMessage} className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Mensagem para ${group.name}...`}
            className="input-field min-w-0 flex-1 text-sm"
            maxLength={1000}
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white transition-all active:scale-95 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #4f6ef7, #6366f1)" }}
          >
            <SendIcon />
          </button>
        </form>
      </div>

      {/* Painel de membros */}
      {showMembers && (
        <MembersPanel
          group={group}
          myId={myId}
          isCreator={isCreator}
          onClose={() => setShowMembers(false)}
          onInvite={() => { setShowMembers(false); setShowInvite(true); }}
          onRefresh={async () => {
            const res = await api.get(`/groups/${groupId}`);
            setGroup(res.data.group);
          }}
          onMemberRemoved={() => showToast("Membro removido.")}
          onError={showError}
        />
      )}

      {/* Painel de convite */}
      {showInvite && (
        <InvitePanel
          onClose={() => setShowInvite(false)}
          onInvite={handleInvite}
          existingMemberIds={group.members?.map((m) => m._id || m) || []}
          pendingIds={group.pendingInvites?.map((i) => i.user?._id || i.user) || []}
        />
      )}

      {/* Definições do grupo (só criador) */}
      {showSettings && isCreator && (
        <GroupSettingsModal
          group={group}
          onClose={() => setShowSettings(false)}
          onUpdated={(g) => { setGroup(g); showToast("Grupo atualizado."); }}
          onDeleted={() => navigate("/groups")}
          onError={showError}
        />
      )}
    </div>
  );
}

/* ── Canal de Voz ─────────────────────────────────────────────────────────── */
function VoiceChannelBar({ participants, myId, inVoice, isMuted, onToggleMute, onLeave, onJoin }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 flex-shrink-0"
      style={{ background: "rgba(34,197,94,0.07)", borderBottom: "1px solid rgba(34,197,94,0.15)" }}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold text-green-400">
        <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
        Canal de Voz
      </span>
      <div className="flex -space-x-1.5 flex-1">
        {participants.map((p) => (
          <div key={p.userId} className="relative" title={p.name}>
            <img
              src={p.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${p.userId}`}
              alt={p.name}
              className="h-6 w-6 rounded-full object-cover ring-1 ring-dark-900"
            />
            {p.userId === myId && isMuted && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-red-500">
                <MutedIcon />
              </span>
            )}
          </div>
        ))}
        {participants.length === 0 && <span className="text-xs text-slate-600">Ninguém em chamada</span>}
      </div>
      {inVoice ? (
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleMute}
            className={`rounded-lg p-1.5 transition-colors ${isMuted ? "bg-red-500/20 text-red-400" : "bg-white/5 text-slate-400 hover:text-slate-200"}`}
          >
            {isMuted ? <MutedIcon /> : <MicIcon />}
          </button>
          <button onClick={onLeave} className="rounded-lg bg-red-500/20 p-1.5 text-red-400 hover:bg-red-500/30">
            <LeaveCallIcon />
          </button>
        </div>
      ) : (
        <button onClick={onJoin} className="rounded-lg bg-green-500/15 px-2.5 py-1 text-xs font-semibold text-green-400 hover:bg-green-500/25">
          Entrar
        </button>
      )}
    </div>
  );
}

/* ── Mensagem de grupo ────────────────────────────────────────────────────── */
function GroupMessageBubble({ msg, myId }) {
  const isMe = msg.sender?._id === myId || msg.sender === myId;
  return (
    <div className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
      {!isMe && (
        <img
          src={msg.sender?.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${msg.sender?._id}`}
          alt={msg.sender?.name}
          className="mb-1 h-7 w-7 flex-shrink-0 rounded-full object-cover"
        />
      )}
      <div className={`max-w-[75%] flex flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
        {!isMe && <span className="px-1 text-xs font-medium text-slate-500">{msg.sender?.name}</span>}
        <div
          className="rounded-2xl px-3.5 py-2 text-sm"
          style={
            isMe
              ? { background: "linear-gradient(135deg, #4f6ef7, #6366f1)", color: "white" }
              : { background: "rgba(255,255,255,0.07)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.06)" }
          }
        >
          {msg.image && <img src={msg.image} alt="" className="mb-1 max-h-48 rounded-xl object-cover" />}
          {msg.text && <p>{msg.text}</p>}
        </div>
        <span className="px-1 text-[10px] text-slate-600">{formatTime(msg.createdAt)}</span>
      </div>
    </div>
  );
}

/* ── Painel de Membros ────────────────────────────────────────────────────── */
function MembersPanel({ group, myId, isCreator, onClose, onInvite, onRefresh, onMemberRemoved, onError }) {
  const [removing, setRemoving] = useState(null);

  const handleRemove = async (memberId) => {
    if (!window.confirm("Remover este membro do grupo?")) return;
    setRemoving(memberId);
    try {
      await api.delete(`/groups/${group._id}/member/${memberId}`);
      await onRefresh();
      onMemberRemoved();
    } catch (err) {
      onError(err?.response?.data?.message || "Erro ao remover membro.");
    }
    setRemoving(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xs flex-col"
        style={{ background: "#0c0c18", borderLeft: "1px solid rgba(255,255,255,0.08)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <h3 className="font-semibold text-white">Membros ({group.members?.length})</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={onInvite}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #4f6ef7, #6366f1)" }}
            >
              Convidar
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
              <XIcon />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {group.members?.map((member) => {
            const mId = member._id || member;
            const memberIsCreator = (group.creator?._id || group.creator) === mId;
            const memberIsAdmin   = group.admins?.some((a) => (a._id || a) === mId);
            return (
              <div key={mId} className="flex items-center gap-3 rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.03)" }}>
                <img
                  src={member.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${mId}`}
                  alt={member.name}
                  className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{member.name || "—"}</p>
                  {memberIsCreator && <p className="text-xs text-brand-400">Criador</p>}
                  {!memberIsCreator && memberIsAdmin && <p className="text-xs text-slate-500">Admin</p>}
                </div>
                {/* Só o criador pode remover — e não pode remover a si próprio */}
                {isCreator && mId !== myId && !memberIsCreator && (
                  <button
                    onClick={() => handleRemove(mId)}
                    disabled={removing === mId}
                    className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                    title="Remover membro"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Painel de Convite ────────────────────────────────────────────────────── */
function InvitePanel({ onClose, onInvite, existingMemberIds, pendingIds }) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [invited, setInvited] = useState(new Set());
  const [toast, setToast]     = useState("");

  const search = async (q) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
      setResults((res.data.users || []).filter((u) => !existingMemberIds.includes(u._id) && !pendingIds.includes(u._id)));
    } catch {}
    setLoading(false);
  };

  const invite = async (userId) => {
    try {
      await onInvite(userId);
      setInvited((prev) => new Set([...prev, userId]));
      setToast("Convite enviado!");
    } catch (err) {
      setToast(err.message || "Erro.");
    }
    setTimeout(() => setToast(""), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl" style={{ background: "#0c0c18", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <h2 className="font-semibold text-white">Convidar para o grupo</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><XIcon /></button>
        </div>
        <div className="p-5 space-y-4">
          {toast && (
            <div className="rounded-xl bg-brand-500/20 px-4 py-2 text-sm font-medium text-brand-300 text-center">{toast}</div>
          )}
          <input
            type="text" value={query} onChange={(e) => search(e.target.value)}
            placeholder="Pesquisar por nome..." className="input-field w-full" autoFocus
          />
          <div className="max-h-64 overflow-y-auto space-y-2">
            {loading && <p className="text-center text-sm text-slate-500">A procurar...</p>}
            {!loading && query.length >= 2 && results.length === 0 && (
              <p className="text-center text-sm text-slate-600">Nenhum utilizador encontrado.</p>
            )}
            {results.map((u) => (
              <div key={u._id} className="flex items-center gap-3 rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.03)" }}>
                <img src={u.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${u._id}`} alt={u.name} className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{u.name}</p>
                  {u.stack?.length > 0 && <p className="text-xs text-slate-500 truncate">{u.stack.slice(0, 3).join(" · ")}</p>}
                </div>
                {invited.has(u._id) ? (
                  <span className="text-xs font-medium text-green-400">Enviado</span>
                ) : (
                  <button
                    onClick={() => invite(u._id)}
                    className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #4f6ef7, #6366f1)" }}
                  >
                    Convidar
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Definições do grupo (criador) ───────────────────────────────────────── */
function GroupSettingsModal({ group, onClose, onUpdated, onDeleted, onError }) {
  const [name, setName]       = useState(group.name || "");
  const [desc, setDesc]       = useState(group.description || "");
  const [avatar, setAvatar]   = useState(group.avatar || "");
  const [saving, setSaving]   = useState(false);
  const fileRef = useRef(null);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { onError("Imagem demasiado grande (máx 3 MB)."); return; }
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) { onError("O nome do grupo é obrigatório."); return; }
    setSaving(true);
    try {
      const res = await api.put(`/groups/${group._id}`, { name: name.trim(), description: desc.trim(), avatar });
      onUpdated(res.data.group);
      onClose();
    } catch (err) {
      onError(err?.response?.data?.message || "Erro ao guardar.");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl" style={{ background: "#0c0c18", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <h2 className="font-semibold text-white">Editar grupo</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><XIcon /></button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-4">
          {/* Foto do grupo */}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative h-20 w-20 overflow-hidden rounded-xl"
              style={{ background: "linear-gradient(135deg, #4f6ef7, #a855f7)" }}
            >
              {avatar ? (
                <img src={avatar} alt="avatar" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-white">{name[0]?.toUpperCase() || "G"}</span>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <CameraIcon />
              </div>
            </button>
            <p className="text-xs text-slate-500">Clica para alterar a foto do grupo</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Nome *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field w-full" maxLength={100} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Descrição</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} maxLength={500} className="input-field w-full resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm">Cancelar</button>
            <button
              type="submit" disabled={saving}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #4f6ef7, #6366f1)" }}
            >
              {saving ? "A guardar..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Skeleton ─────────────────────────────────────────────────────────────── */
function GroupChatSkeleton() {
  return (
    <div className="flex h-full flex-col animate-pulse">
      <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="h-9 w-9 rounded-xl bg-dark-600" />
        <div className="space-y-1.5"><div className="h-3.5 w-24 rounded bg-dark-600" /><div className="h-2.5 w-16 rounded bg-dark-600" /></div>
      </div>
      <div className="flex-1 p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="h-7 w-7 rounded-full bg-dark-600" />
            <div className="h-10 w-40 rounded-2xl bg-dark-600" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Utils ────────────────────────────────────────────────────────────────── */
function formatTime(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/* ── Icons ────────────────────────────────────────────────────────────────── */
function XIcon({ className = "h-5 w-5" }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
}
function BackIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>;
}
function SendIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>;
}
function MicIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" /></svg>;
}
function MutedIcon() {
  return <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><line x1="1" y1="1" x2="23" y2="23" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v4M8 23h8" /></svg>;
}
function PeopleIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
function TrashIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>;
}
function LeaveIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>;
}
function LeaveCallIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 15.5L19 13l-2.5-2.5M19 13H8M8 21H5a2 2 0 01-2-2V5a2 2 0 012-2h3" /></svg>;
}
function CameraIcon() {
  return <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>;
}
