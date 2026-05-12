import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io as socketIO } from "socket.io-client";
import api from "../lib/api";
import { useAuthStore } from "../store/authStore";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "";

export default function GroupChat() {
  const { groupId } = useParams();
  const { user }    = useAuthStore();
  const navigate    = useNavigate();

  const [group, setGroup]         = useState(null);
  const [messages, setMessages]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [text, setText]           = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [showInvite, setShowInvite]   = useState(false);
  const [error, setError]         = useState("");

  // Voice call state
  const [inVoice, setInVoice]           = useState(false);
  const [voiceParticipants, setVoiceParticipants] = useState([]); // [{userId, name, avatar}]
  const [isMuted, setIsMuted]           = useState(false);

  const socketRef    = useRef(null);
  const bottomRef    = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnsRef   = useRef({}); // userId → RTCPeerConnection

  // ── Initialize socket & load data ─────────────────────────────────────────
  useEffect(() => {
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
      // Create peer connection to this new user if we are in the call
      if (localStreamRef.current && uid !== user?._id) {
        createOffer(uid);
      }
    });

    socket.on("group:voice-user-left", ({ userId: uid }) => {
      setVoiceParticipants((prev) => prev.filter((p) => p.userId !== uid));
      closePeer(uid);
    });

    // WebRTC signaling
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

    // Load group + messages
    (async () => {
      try {
        const [gRes, mRes] = await Promise.all([
          api.get(`/groups/${groupId}`),
          api.get(`/groups/${groupId}/messages`),
        ]);
        setGroup(gRes.data.group);
        setMessages(mRes.data.messages || []);
      } catch (err) {
        if (err?.response?.status === 403 || err?.response?.status === 404) {
          navigate("/groups");
        }
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

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Voice call helpers ─────────────────────────────────────────────────────
  const getOrCreatePeer = useCallback((remoteUserId) => {
    if (peerConnsRef.current[remoteUserId]) return peerConnsRef.current[remoteUserId];

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current?.emit("group:voice-ice", { groupId, to: remoteUserId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      playRemoteAudio(remoteUserId, e.streams[0]);
    };

    peerConnsRef.current[remoteUserId] = pc;
    return pc;
  }, [groupId]);

  const createOffer = useCallback(async (remoteUserId) => {
    const pc = getOrCreatePeer(remoteUserId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current?.emit("group:voice-offer", { groupId, to: remoteUserId, offer });
  }, [groupId, getOrCreatePeer]);

  const closePeer = (remoteUserId) => {
    const pc = peerConnsRef.current[remoteUserId];
    if (pc) { pc.close(); delete peerConnsRef.current[remoteUserId]; }
    // Remove audio element
    const el = document.getElementById(`audio-${remoteUserId}`);
    if (el) el.remove();
  };

  const playRemoteAudio = (uid, stream) => {
    let el = document.getElementById(`audio-${uid}`);
    if (!el) {
      el = document.createElement("audio");
      el.id = `audio-${uid}`;
      el.autoplay = true;
      document.body.appendChild(el);
    }
    el.srcObject = stream;
  };

  const joinVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setInVoice(true);
      socketRef.current?.emit("group:voice-join", { groupId });

      // After server responds with participants, create offers to each
      // (handled in the socket event handler above)
    } catch (err) {
      setError("Não foi possível aceder ao microfone.");
      setTimeout(() => setError(""), 3000);
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

  // ── Send message ─────────────────────────────────────────────────────────
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

  // ── Invite user ──────────────────────────────────────────────────────────
  const handleInvite = async (userId) => {
    try {
      await api.post(`/groups/${groupId}/invite/${userId}`);
      return true;
    } catch (err) {
      throw new Error(err?.response?.data?.message || "Erro ao convidar.");
    }
  };

  // ── Leave group ──────────────────────────────────────────────────────────
  const handleLeaveGroup = async () => {
    if (!window.confirm("Sair do grupo?")) return;
    try {
      await api.delete(`/groups/${groupId}/leave`);
      navigate("/groups");
    } catch (err) {
      setError(err?.response?.data?.message || "Erro ao sair do grupo.");
    }
  };

  if (loading) return <GroupChatSkeleton />;
  if (!group) return null;

  const myId = user?._id;
  const isAdmin = group.admins?.some((a) => (a._id || a) === myId);
  const isCreator = group.creator?._id === myId || group.creator === myId;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Error toast */}
      {error && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-2xl bg-red-500/90 px-5 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur-sm">
          {error}
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

        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg, #4f6ef7, #a855f7)" }}
        >
          {group.avatar ? (
            <img src={group.avatar} alt={group.name} className="h-full w-full rounded-xl object-cover" />
          ) : (
            group.name?.[0]?.toUpperCase()
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white truncate">{group.name}</p>
          <p className="text-xs text-slate-500">{group.members?.length} membros</p>
        </div>

        <div className="flex items-center gap-1">
          {/* Voice channel toggle */}
          <button
            onClick={inVoice ? leaveVoice : joinVoice}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              inVoice
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "bg-green-500/15 text-green-400 hover:bg-green-500/25"
            }`}
            title={inVoice ? "Sair da chamada" : "Entrar na chamada de voz"}
          >
            <MicIcon />
            <span className="hidden sm:inline">{inVoice ? "Sair" : "Voz"}</span>
          </button>

          {/* Members / invite */}
          <button
            onClick={() => setShowMembers(true)}
            className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
            title="Membros"
          >
            <PeopleIcon />
          </button>

          {/* Leave group */}
          {!isCreator && (
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

      {/* Voice channel bar */}
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-600">Ainda sem mensagens. Sê o primeiro a escrever!</p>
          </div>
        )}
        {messages.map((msg) => (
          <GroupMessage key={msg._id} msg={msg} myId={myId} />
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

      {/* Members panel */}
      {showMembers && (
        <MembersPanel
          group={group}
          myId={myId}
          isAdmin={isAdmin}
          onClose={() => setShowMembers(false)}
          onInvite={() => { setShowMembers(false); setShowInvite(true); }}
          onGroupUpdated={(g) => setGroup(g)}
          onRefresh={async () => {
            const res = await api.get(`/groups/${groupId}`);
            setGroup(res.data.group);
          }}
        />
      )}

      {/* Invite panel */}
      {showInvite && (
        <InvitePanel
          onClose={() => setShowInvite(false)}
          onInvite={handleInvite}
          existingMemberIds={group.members?.map((m) => m._id || m) || []}
          pendingIds={group.pendingInvites?.map((i) => i.user?._id || i.user) || []}
        />
      )}
    </div>
  );
}

/* ── Voice Channel Bar ────────────────────────────────────────────────────── */
function VoiceChannelBar({ participants, myId, inVoice, isMuted, onToggleMute, onLeave, onJoin }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 flex-shrink-0"
      style={{
        background: "rgba(34,197,94,0.07)",
        borderBottom: "1px solid rgba(34,197,94,0.15)",
      }}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold text-green-400">
        <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
        Canal de Voz
      </span>

      {/* Participant avatars */}
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
        {participants.length === 0 && (
          <span className="text-xs text-slate-600">Ninguém em chamada</span>
        )}
      </div>

      {/* Controls */}
      {inVoice ? (
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleMute}
            className={`rounded-lg p-1.5 text-xs transition-colors ${
              isMuted ? "bg-red-500/20 text-red-400" : "bg-white/5 text-slate-400 hover:text-slate-200"
            }`}
            title={isMuted ? "Ativar microfone" : "Silenciar"}
          >
            {isMuted ? <MutedIcon /> : <MicIcon />}
          </button>
          <button
            onClick={onLeave}
            className="rounded-lg bg-red-500/20 p-1.5 text-red-400 transition-colors hover:bg-red-500/30"
            title="Sair da chamada"
          >
            <LeaveCallIcon />
          </button>
        </div>
      ) : (
        <button
          onClick={onJoin}
          className="rounded-lg bg-green-500/15 px-2.5 py-1 text-xs font-semibold text-green-400 transition-colors hover:bg-green-500/25"
        >
          Entrar
        </button>
      )}
    </div>
  );
}

/* ── Group Message ────────────────────────────────────────────────────────── */
function GroupMessage({ msg, myId }) {
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
      <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
        {!isMe && (
          <span className="px-1 text-xs font-medium text-slate-500">{msg.sender?.name}</span>
        )}
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
        <span className="px-1 text-[10px] text-slate-600">
          {formatTime(msg.createdAt)}
        </span>
      </div>
    </div>
  );
}

/* ── Members Panel ────────────────────────────────────────────────────────── */
function MembersPanel({ group, myId, isAdmin, onClose, onInvite, onRefresh }) {
  const [removing, setRemoving] = useState(null);

  const handleRemove = async (memberId) => {
    if (!window.confirm("Remover este membro?")) return;
    setRemoving(memberId);
    try {
      await api.delete(`/groups/${group._id}/member/${memberId}`);
      await onRefresh();
    } catch {}
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
            const isCreator = (group.creator?._id || group.creator) === mId;
            const isMemberAdmin = group.admins?.some((a) => (a._id || a) === mId);
            return (
              <div key={mId} className="flex items-center gap-3 rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.03)" }}>
                <img
                  src={member.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${mId}`}
                  alt={member.name}
                  className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{member.name}</p>
                  {isCreator && <p className="text-xs text-brand-400">Criador</p>}
                  {!isCreator && isMemberAdmin && <p className="text-xs text-slate-500">Admin</p>}
                </div>
                {isAdmin && mId !== myId && !isCreator && (
                  <button
                    onClick={() => handleRemove(mId)}
                    disabled={removing === mId}
                    className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                    title="Remover"
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

/* ── Invite Panel ─────────────────────────────────────────────────────────── */
function InvitePanel({ onClose, onInvite, existingMemberIds, pendingIds }) {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [invited, setInvited]   = useState(new Set());
  const [toast, setToast]       = useState("");

  const search = async (q) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
      setResults(
        (res.data.users || []).filter(
          (u) => !existingMemberIds.includes(u._id) && !pendingIds.includes(u._id)
        )
      );
    } catch {}
    setLoading(false);
  };

  const invite = async (userId) => {
    try {
      await onInvite(userId);
      setInvited((prev) => new Set([...prev, userId]));
      setToast("Convite enviado!");
      setTimeout(() => setToast(""), 2500);
    } catch (err) {
      setToast(err.message || "Erro ao convidar.");
      setTimeout(() => setToast(""), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl"
        style={{ background: "#0c0c18", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <h2 className="font-semibold text-white">Convidar para o grupo</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <XIcon />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {toast && (
            <div className="rounded-xl bg-brand-500/20 px-4 py-2 text-sm font-medium text-brand-300 text-center">
              {toast}
            </div>
          )}

          <input
            type="text"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Pesquisar por nome..."
            className="input-field w-full"
            autoFocus
          />

          <div className="max-h-64 overflow-y-auto space-y-2">
            {loading && <p className="text-center text-sm text-slate-500">A procurar...</p>}
            {!loading && query.length >= 2 && results.length === 0 && (
              <p className="text-center text-sm text-slate-600">Nenhum utilizador encontrado.</p>
            )}
            {results.map((u) => (
              <div key={u._id} className="flex items-center gap-3 rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.03)" }}>
                <img
                  src={u.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${u._id}`}
                  alt={u.name}
                  className="h-9 w-9 rounded-full object-cover flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{u.name}</p>
                  {u.stack?.length > 0 && (
                    <p className="text-xs text-slate-500 truncate">{u.stack.slice(0, 3).join(" · ")}</p>
                  )}
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

/* ── Skeleton ─────────────────────────────────────────────────────────────── */
function GroupChatSkeleton() {
  return (
    <div className="flex h-full flex-col animate-pulse">
      <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="h-9 w-9 rounded-xl bg-dark-600" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-24 rounded bg-dark-600" />
          <div className="h-2.5 w-16 rounded bg-dark-600" />
        </div>
      </div>
      <div className="flex-1 p-4">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="h-7 w-7 rounded-full bg-dark-600" />
              <div className="h-10 w-40 rounded-2xl bg-dark-600" />
            </div>
          ))}
        </div>
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
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
function BackIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}
function MutedIcon() {
  return (
    <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <line x1="1" y1="1" x2="23" y2="23" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v4M8 23h8" />
    </svg>
  );
}
function PeopleIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function LeaveIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}
function LeaveCallIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 15.5L19 13l-2.5-2.5M19 13H8M8 21H5a2 2 0 01-2-2V5a2 2 0 012-2h3" />
    </svg>
  );
}
