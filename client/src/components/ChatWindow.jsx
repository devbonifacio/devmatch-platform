import { useCallback, useEffect, useRef, useState } from "react";
import VoiceCall from "./VoiceCall";
import { safeUrl } from "../lib/sanitize";

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

export default function ChatWindow({ messages, onSend, onTyping, otherUser, isOnline = false, peerTyping = false, socket, matchId, currentUser }) {
  const [text, setText] = useState("");
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimer = useRef(null);
  const isTypingRef = useRef(false);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, peerTyping]);

  const handleTyping = useCallback((e) => {
    setText(e.target.value);
    if (!isTypingRef.current) { isTypingRef.current = true; onTyping?.(true); }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { isTypingRef.current = false; onTyping?.(false); }, 1500);
  }, [onTyping]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
  };

  const grouped = groupMessages(messages);

  return (
    <div className="flex h-full flex-col">
      <ChatHeader user={otherUser} isOnline={isOnline} socket={socket} matchId={matchId} currentUser={currentUser} />
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
        style={{ backgroundImage: "radial-gradient(rgba(79,110,247,0.015) 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
        {grouped.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 text-4xl">👋</div>
            <p className="text-sm font-medium text-slate-400">Início da conversa com <span className="text-white">{otherUser?.name || "este dev"}</span></p>
            <p className="mt-1 text-xs text-slate-600">Diz olá e começa a colaborar!</p>
            <p className="mt-2 text-xs text-slate-700">💡 Também podes fazer uma chamada de voz no topo</p>
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
          return <MessageBubble key={item._id} message={item} otherUser={otherUser} />;
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
      <div className="px-4 py-3" style={{ background: "rgba(9,9,18,0.9)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderTop: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 -4px 20px rgba(0,0,0,0.3)" }}>
        <div className="flex items-end gap-3">
          <div className="relative flex-1">
            <textarea ref={inputRef} rows={1} placeholder={`Mensagem para ${otherUser?.name || "dev"}...`}
              className="input-field resize-none pr-4 leading-relaxed" style={{ minHeight: "44px", maxHeight: "120px" }}
              value={text} onChange={handleTyping} onKeyDown={handleKeyDown} />
          </div>
          <button onClick={handleSubmit} disabled={!text.trim()}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg shadow-brand-500/20 transition-all duration-200 hover:bg-brand-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
            <SendIcon />
          </button>
        </div>
        <p className="mt-1.5 text-right text-xs text-slate-700">Enter para enviar · Shift+Enter para nova linha</p>
      </div>
    </div>
  );
}

function ChatHeader({ user, isOnline, socket, matchId, currentUser }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3"
      style={{ background: "rgba(9,9,18,0.9)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
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

function MessageBubble({ message, otherUser }) {
  const { isMine, text, createdAt, isFirstInGroup } = message;
  return (
    <div className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : "flex-row"} ${isFirstInGroup ? "mt-3" : "mt-0.5"}`}>
      {!isMine ? (isFirstInGroup ? <Avatar user={otherUser} size="sm" /> : <div className="w-6 flex-shrink-0" />) : null}
      <div className={`flex flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}>
        <div className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm leading-relaxed lg:max-w-md ${isMine ? "rounded-br-sm bg-brand-500 text-white" : "rounded-bl-sm bg-dark-600 text-slate-100"}`}
          style={isMine ? { boxShadow: "0 2px 8px rgba(79,110,247,0.25), inset 0 1px 0 rgba(255,255,255,0.12)" } : { border: "1px solid rgba(255,255,255,0.06)" }}>
          {text}
        </div>
        {createdAt && <span className="px-1 text-xs text-slate-700">{formatTime(createdAt)}</span>}
      </div>
    </div>
  );
}

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

function SendIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
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
