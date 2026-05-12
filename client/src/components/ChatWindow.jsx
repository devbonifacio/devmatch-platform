import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import VoiceCall from "./VoiceCall";
import { safeUrl } from "../lib/sanitize";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function formatDateDivider(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-PT", { day: "numeric", month: "long" });
}

function formatDuration(s) {
  if (!s || isNaN(s) || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function groupMessages(messages) {
  const groups = [];
  let lastDate = null;
  messages.forEach((msg, i) => {
    const msgDate = msg.createdAt ? new Date(msg.createdAt).toDateString() : null;
    if (msgDate && msgDate !== lastDate) {
      groups.push({ type: "divider", date: msg.createdAt, id: `div-${i}` });
      lastDate = msgDate;
    }
    const prev = messages[i - 1];
    const isFirstInGroup =
      !prev || prev.isMine !== msg.isMine ||
      (msg.createdAt && prev.createdAt && new Date(msg.createdAt) - new Date(prev.createdAt) > 5 * 60 * 1000);
    groups.push({ type: "message", ...msg, isFirstInGroup });
  });
  return groups;
}

// Compress image to max 800px JPEG 0.82
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatWindow({
  messages, onSend, onTyping, onView,
  otherUser, isOnline = false, peerTyping = false,
  socket, matchId, currentUser,
}) {
  const [text, setText] = useState("");
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimer = useRef(null);
  const isTypingRef = useRef(false);

  // Image state
  const [imageToSend, setImageToSend] = useState(null); // { dataUrl }
  const [viewOnceMode, setViewOnceMode] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const imageInputRef = useRef(null);

  // Audio state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioToSend, setAudioToSend] = useState(null); // { dataUrl }
  const mediaRecorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioStreamRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, peerTyping]);

  // ── Text ─────────────────────────────────────────────────────────────────────

  const handleTyping = useCallback((e) => {
    setText(e.target.value);
    if (!isTypingRef.current) { isTypingRef.current = true; onTyping?.(true); }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { isTypingRef.current = false; onTyping?.(false); }, 1500);
  }, [onTyping]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    onSend({ text: text.trim() });
    setText("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  // ── Image ────────────────────────────────────────────────────────────────────

  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const dataUrl = await compressImage(file);
    setImageToSend({ dataUrl });
    e.target.value = "";
  };

  const cancelImage = () => { setImageToSend(null); setViewOnceMode(false); };

  const sendImage = () => {
    if (!imageToSend) return;
    onSend({ image: imageToSend.dataUrl, viewOnce: viewOnceMode });
    setImageToSend(null);
    setViewOnceMode(false);
  };

  // ── Audio recording ───────────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        audioStreamRef.current?.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
        const blob = new Blob(chunks, { type: mimeType });
        const reader = new FileReader();
        reader.onload = (ev) => setAudioToSend({ dataUrl: ev.target.result });
        reader.readAsDataURL(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => {
          if (s >= 59) { stopRecording(); return 60; }
          return s + 1;
        });
      }, 1000);
    } catch {
      alert("Não foi possível aceder ao microfone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
  };

  const cancelAudio = () => {
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioStreamRef.current = null;
    setAudioToSend(null);
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
  };

  const sendAudio = () => {
    if (!audioToSend) return;
    onSend({ audio: audioToSend.dataUrl });
    setAudioToSend(null);
  };

  // Cleanup on unmount
  useEffect(() => () => {
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    clearInterval(recordingTimerRef.current);
  }, []);

  const grouped = groupMessages(messages);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      <ChatHeader user={otherUser} isOnline={isOnline} socket={socket} matchId={matchId} currentUser={currentUser} />

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
        style={{ backgroundImage: "radial-gradient(rgba(79,110,247,0.015) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
      >
        {grouped.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 text-4xl">👋</div>
            <p className="text-sm font-medium text-slate-400">Início da conversa com <span className="text-white">{otherUser?.name || "este dev"}</span></p>
            <p className="mt-1 text-xs text-slate-600">Diz olá e começa a colaborar!</p>
            <p className="mt-2 text-xs text-slate-700">💡 Também podes enviar imagens e áudios</p>
          </div>
        )}

        {grouped.map((item) => {
          if (item.type === "divider") return (
            <div key={item.id} className="flex items-center gap-3 py-3">
              <div className="h-px flex-1 bg-white/5" />
              <span className="text-xs text-slate-600">{formatDateDivider(item.date)}</span>
              <div className="h-px flex-1 bg-white/5" />
            </div>
          );
          return (
            <MessageBubble
              key={item._id}
              message={item}
              otherUser={otherUser}
              onViewOnce={(id) => onView?.(id)}
              onLightbox={setLightboxSrc}
            />
          );
        })}

        {peerTyping && (
          <div className="flex items-end gap-2 animate-fade-in">
            <Avatar user={otherUser} size="sm" />
            <div className="rounded-2xl rounded-bl-sm bg-dark-600 px-4 py-3" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Image preview modal (before sending) */}
      {imageToSend && createPortal(
        <ImagePreviewModal
          dataUrl={imageToSend.dataUrl}
          viewOnce={viewOnceMode}
          onToggle={() => setViewOnceMode((v) => !v)}
          onCancel={cancelImage}
          onSend={sendImage}
        />,
        document.body
      )}

      {/* Lightbox */}
      {lightboxSrc && createPortal(
        <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />,
        document.body
      )}

      {/* Input area */}
      <div
        className="px-4 py-3"
        style={{ background: "rgba(9,9,18,0.9)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderTop: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 -4px 20px rgba(0,0,0,0.3)" }}
      >
        {/* Audio to-send preview */}
        {audioToSend && !isRecording && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/10 bg-dark-700 px-3 py-2">
            <AudioPlayer src={audioToSend.dataUrl} isMine={true} compact />
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={cancelAudio} className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5">Cancelar</button>
              <button onClick={sendAudio} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600">Enviar</button>
            </div>
          </div>
        )}

        {/* Recording UI */}
        {isRecording && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="flex-1 text-sm font-medium text-red-400">A gravar… {formatDuration(recordingSeconds)}</span>
            <button
              onClick={stopRecording}
              className="flex items-center gap-1.5 rounded-lg bg-red-500/20 border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/30"
            >
              <StopIcon size={12} /> Parar
            </button>
          </div>
        )}

        {/* Main input row */}
        {!isRecording && !audioToSend && (
          <div className="flex items-end gap-2">
            {/* Image button */}
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              title="Enviar imagem"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-dark-700 text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200"
            >
              <ImageIcon size={18} />
            </button>

            {/* Mic button */}
            <button
              type="button"
              onClick={startRecording}
              title="Gravar áudio"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-dark-700 text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200"
            >
              <MicIcon size={18} />
            </button>

            <div className="relative flex-1">
              <textarea
                ref={inputRef}
                rows={1}
                placeholder={`Mensagem para ${otherUser?.name || "dev"}…`}
                className="input-field resize-none pr-4 leading-relaxed"
                style={{ minHeight: "44px", maxHeight: "120px" }}
                value={text}
                onChange={handleTyping}
                onKeyDown={handleKeyDown}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={!text.trim()}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg shadow-brand-500/20 transition-all duration-200 hover:bg-brand-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SendIcon />
            </button>
          </div>
        )}

        <p className="mt-1.5 text-right text-xs text-slate-700">Enter para enviar · Shift+Enter para nova linha</p>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageFileChange}
        />
      </div>
    </div>
  );
}

// ── ChatHeader ────────────────────────────────────────────────────────────────

function ChatHeader({ user, isOnline, socket, matchId, currentUser }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ background: "rgba(9,9,18,0.9)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
    >
      <div className="relative">
        <Avatar user={user} size="md" />
        {isOnline && <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full border-2 border-dark-800 bg-green-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="truncate text-sm font-semibold text-white">{user?.name || "Dev"}</h2>
        <p className="text-xs text-slate-500">{isOnline ? <span className="text-green-400">online agora</span> : "offline"}</p>
      </div>
      <div className="flex items-center gap-2">
        {socket && matchId && <VoiceCall socket={socket} matchId={matchId} otherUser={user} currentUser={currentUser} />}
        {safeUrl(user?.github) && (
          <a href={safeUrl(user.github)} target="_blank" rel="noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300" title="GitHub">
            <GithubIcon />
          </a>
        )}
      </div>
    </div>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message, otherUser, onViewOnce, onLightbox }) {
  const { isMine, text, image, audio, viewOnce, viewOnceViewed, createdAt, isFirstInGroup, _id } = message;
  const [localViewed, setLocalViewed] = useState(viewOnceViewed || false);

  const handleTapViewOnce = () => {
    if (localViewed) return;
    setLocalViewed(true);
    onViewOnce?.(String(_id));
  };

  const bubbleBase = isMine
    ? "rounded-2xl rounded-br-sm bg-brand-500 text-white"
    : "rounded-2xl rounded-bl-sm bg-dark-600 text-slate-100";

  const bubbleStyle = isMine
    ? { boxShadow: "0 2px 8px rgba(79,110,247,0.25), inset 0 1px 0 rgba(255,255,255,0.12)" }
    : { border: "1px solid rgba(255,255,255,0.06)" };

  return (
    <div className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : "flex-row"} ${isFirstInGroup ? "mt-3" : "mt-0.5"}`}>
      {!isMine ? (isFirstInGroup ? <Avatar user={otherUser} size="sm" /> : <div className="w-6 flex-shrink-0" />) : null}

      <div className={`flex flex-col gap-1 ${isMine ? "items-end" : "items-start"} max-w-xs lg:max-w-md`}>
        {/* Text */}
        {text ? (
          <div className={`px-4 py-2.5 text-sm leading-relaxed ${bubbleBase}`} style={bubbleStyle}>
            {text}
          </div>
        ) : null}

        {/* Image */}
        {image && !viewOnce && (
          <button
            onClick={() => onLightbox?.(image)}
            className="overflow-hidden rounded-2xl focus:outline-none"
            style={{ maxWidth: "220px" }}
          >
            <img
              src={image}
              alt="imagem"
              className="block max-h-60 w-full object-cover transition-opacity hover:opacity-90"
              style={{ borderRadius: "inherit" }}
            />
          </button>
        )}

        {/* View-once image */}
        {viewOnce && (
          isMine ? (
            // Sender sees their image normally with a badge
            image ? (
              <div className="relative">
                <button
                  onClick={() => onLightbox?.(image)}
                  className="overflow-hidden rounded-2xl focus:outline-none"
                  style={{ maxWidth: "220px" }}
                >
                  <img src={image} alt="ver uma vez" className="block max-h-60 w-full object-cover hover:opacity-90" />
                </button>
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
                  👁 Ver uma vez
                </span>
              </div>
            ) : null
          ) : localViewed ? (
            // Receiver already viewed it
            <div className={`px-4 py-2.5 text-sm ${bubbleBase}`} style={bubbleStyle}>
              🔥 <span className="opacity-70">Já vista</span>
            </div>
          ) : (
            // Receiver hasn't tapped yet
            <button
              onClick={handleTapViewOnce}
              className={`flex items-center gap-2.5 px-4 py-3 text-sm text-left ${bubbleBase} transition-opacity hover:opacity-80`}
              style={bubbleStyle}
            >
              <span className="text-xl">👆</span>
              <div>
                <p className="font-medium">Toca para ver</p>
                <p className="text-xs opacity-60">Visível uma vez</p>
              </div>
            </button>
          )
        )}

        {/* Audio */}
        {audio && <AudioPlayer src={audio} isMine={isMine} />}

        {createdAt && <span className="px-1 text-xs text-slate-700">{formatTime(createdAt)}</span>}
      </div>
    </div>
  );
}

// ── AudioPlayer ───────────────────────────────────────────────────────────────

function AudioPlayer({ src, isMine, compact = false }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().catch(() => {}); setPlaying(true); }
  };

  const pct = duration ? (currentTime / duration) * 100 : 0;

  const bg = isMine
    ? "bg-brand-600"
    : "bg-dark-700";

  const trackBg = isMine ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)";
  const fillBg  = isMine ? "rgba(255,255,255,0.9)" : "#818cf8";
  const textCol = isMine ? "text-white/75" : "text-slate-400";

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${compact ? "" : bg}`}
      style={compact ? {} : isMine
        ? { boxShadow: "0 2px 8px rgba(79,110,247,0.25)", minWidth: "180px" }
        : { border: "1px solid rgba(255,255,255,0.06)", minWidth: "180px" }}
    >
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
        onDurationChange={(e) => setDuration(e.target.duration)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
      />

      <button
        onClick={toggle}
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${isMine ? "bg-white/20 text-white hover:bg-white/30" : "bg-brand-500/20 text-brand-400 hover:bg-brand-500/30"} transition-colors`}
      >
        {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
      </button>

      <div className="flex flex-1 flex-col gap-1.5 min-w-0">
        <div
          className="h-1.5 w-full rounded-full cursor-pointer"
          style={{ background: trackBg }}
          onClick={(e) => {
            if (!audioRef.current || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            audioRef.current.currentTime = ratio * duration;
          }}
        >
          <div
            className="h-1.5 rounded-full transition-all"
            style={{ width: `${pct}%`, background: fillBg }}
          />
        </div>
      </div>

      <span className={`text-xs font-mono flex-shrink-0 ${textCol}`}>
        {formatDuration(playing ? currentTime : duration)}
      </span>
    </div>
  );
}

// ── Image preview modal ───────────────────────────────────────────────────────

function ImagePreviewModal({ dataUrl, viewOnce, onToggle, onCancel, onSend }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "rgba(10,10,22,0.95)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "24px",
          padding: "24px",
          maxWidth: "480px",
          width: "100%",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <p style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
          Pré-visualização
        </p>

        <img
          src={dataUrl}
          alt="preview"
          style={{ width: "100%", maxHeight: "300px", objectFit: "contain", borderRadius: "12px" }}
        />

        {/* View-once toggle */}
        <button
          onClick={onToggle}
          style={{
            display: "flex", alignItems: "center", gap: "12px",
            background: viewOnce ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${viewOnce ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.1)"}`,
            borderRadius: "12px",
            padding: "12px 16px",
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
            transition: "all 0.2s",
          }}
        >
          <span style={{ fontSize: "20px" }}>{viewOnce ? "👁" : "🖼️"}</span>
          <div>
            <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: viewOnce ? "#c4b5fd" : "#e2e8f0" }}>
              {viewOnce ? "Ver uma vez (ativo)" : "Envio normal"}
            </p>
            <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
              {viewOnce ? "O destinatário só poderá ver uma vez" : "Clica para ativar «ver uma vez»"}
            </p>
          </div>
        </button>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "10px", borderRadius: "12px",
              background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
              color: "#94a3b8", fontSize: "14px", fontWeight: 600, cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onSend}
            style={{
              flex: 2, padding: "10px", borderRadius: "12px",
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              border: "none", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer",
              boxShadow: "0 4px 14px rgba(99,102,241,0.4)",
            }}
          >
            {viewOnce ? "👁 Enviar (ver uma vez)" : "Enviar imagem"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ src, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.92)",
        backdropFilter: "blur(20px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "zoom-out",
        padding: "24px",
      }}
    >
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "100%", maxHeight: "90vh",
          borderRadius: "12px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
          cursor: "default",
        }}
      />
      <button
        onClick={onClose}
        style={{
          position: "fixed", top: "16px", right: "16px",
          background: "rgba(255,255,255,0.1)", border: "none",
          color: "#fff", borderRadius: "50%",
          width: "36px", height: "36px",
          cursor: "pointer", fontSize: "18px",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        ×
      </button>
    </div>
  );
}

// ── Supporting sub-components ─────────────────────────────────────────────────

function Avatar({ user, size = "md" }) {
  const sizeClass = size === "sm" ? "h-6 w-6 flex-shrink-0" : "h-9 w-9 flex-shrink-0";
  const src = user?.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${user?._id || "default"}`;
  return <img src={src} alt={user?.name || ""} className={`${sizeClass} rounded-full object-cover`} />;
}

function TypingDots() {
  return (
    <div className="flex gap-1.5 items-center h-4">
      {[0, 1, 2].map((i) => (
        <span key={i} className="block rounded-full"
          style={{ width: "7px", height: "7px", background: "rgba(148,163,184,0.7)", animation: "typingBounce 1.4s ease-in-out infinite", animationDelay: `${i * 0.18}s` }} />
      ))}
      <style>{`@keyframes typingBounce { 0%, 60%, 100% { transform: translateY(0) scale(1); opacity: 0.4; } 30% { transform: translateY(-5px) scale(1.1); opacity: 1; } }`}</style>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function SendIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  );
}

function ImageIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

function MicIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  );
}

function StopIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} fill="currentColor" viewBox="0 0 24 24">
      <rect x="4" y="4" width="16" height="16" rx="3" />
    </svg>
  );
}

function PlayIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
