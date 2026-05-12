import { useState, useRef } from "react";

const SWIPE_THRESHOLD = 100;
const ROTATION_FACTOR = 0.08;
const MAX_VISIBLE_STACK = 4;

export default function DevCard({ dev, onLike, onSkip, onFriendRequest, friendStatus }) {
  const [dragging, setDragging]         = useState(false);
  const [offset, setOffset]             = useState({ x: 0, y: 0 });
  const [exitDir, setExitDir]           = useState(null);
  const [stackExpanded, setStackExpanded] = useState(false);
  const [tilt, setTilt]                 = useState({ x: 0, y: 0 });
  const [shine, setShine]               = useState({ x: 50, y: 50 });

  const startPos = useRef({ x: 0, y: 0 });
  const cardRef  = useRef(null);

  const rotation    = offset.x * ROTATION_FACTOR;
  const likeOpacity = Math.min(Math.max(offset.x  / SWIPE_THRESHOLD, 0), 1);
  const skipOpacity = Math.min(Math.max(-offset.x / SWIPE_THRESHOLD, 0), 1);

  const onPointerDown = (e) => {
    if (exitDir) return;
    cardRef.current?.setPointerCapture(e.pointerId);
    setDragging(true);
    startPos.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };

  const onPointerMove = (e) => {
    if (dragging) {
      setOffset({
        x: e.clientX - startPos.current.x,
        y: e.clientY - startPos.current.y,
      });
      return;
    }
    // 3D tilt when hovering (not dragging)
    if (!exitDir && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top)  / rect.height;
      setTilt({ x: (py - 0.5) * -14, y: (px - 0.5) * 14 });
      setShine({ x: px * 100, y: py * 100 });
    }
  };

  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    if      (offset.x >  SWIPE_THRESHOLD) triggerSwipe("right");
    else if (offset.x < -SWIPE_THRESHOLD) triggerSwipe("left");
    else    setOffset({ x: 0, y: 0 });
  };

  const onPointerLeave = (e) => {
    onPointerUp(e);
    // Reset tilt on mouse leave
    setTilt({ x: 0, y: 0 });
    setShine({ x: 50, y: 50 });
  };

  const triggerSwipe = (dir) => {
    setExitDir(dir);
    setTilt({ x: 0, y: 0 });
    setTimeout(() => {
      if (dir === "right") onLike(dev._id);
      else                 onSkip(dev._id);
    }, 380);
  };

  // Build the card transform
  const cardStyle = exitDir
    ? {
        transform: exitDir === "right"
          ? "translateX(140%) rotate(22deg)"
          : "translateX(-140%) rotate(-22deg)",
        opacity: 0,
        transition: "transform 0.38s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.38s ease",
      }
    : dragging
    ? {
        transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg)`,
        transition: "none",
        cursor: "grabbing",
      }
    : {
        transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: "transform 0.18s ease-out",
        cursor: "grab",
      };

  const stack       = dev.stack || [];
  const visibleStack = stackExpanded ? stack : stack.slice(0, MAX_VISIBLE_STACK);
  const hiddenCount = stack.length - MAX_VISIBLE_STACK;

  // Dynamic border colour while dragging
  const borderColor = dragging
    ? offset.x > 20  ? "rgba(74,222,128,0.5)"
    : offset.x < -20 ? "rgba(248,113,113,0.5)"
    : "rgba(255,255,255,0.1)"
    : "rgba(255,255,255,0.09)";

  const glowShadow = dragging
    ? offset.x > 20
      ? "0 32px 80px rgba(0,0,0,0.6), 0 0 60px rgba(74,222,128,0.18)"
      : offset.x < -20
      ? "0 32px 80px rgba(0,0,0,0.6), 0 0 60px rgba(248,113,113,0.18)"
      : "0 32px 80px rgba(0,0,0,0.6)"
    : "0 12px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)";

  return (
    <div className="relative select-none" style={{ touchAction: "none" }}>

      {/* LIKE stamp */}
      <div
        className="pointer-events-none absolute left-6 top-8 z-10 rotate-[-22deg] rounded-2xl border-[3px] border-green-400 px-4 py-2 font-mono text-xl font-black uppercase tracking-widest text-green-400"
        style={{
          opacity: likeOpacity,
          transition: dragging ? "none" : "opacity 0.2s",
          textShadow: "0 0 30px rgba(74,222,128,0.9), 0 0 60px rgba(74,222,128,0.4)",
          boxShadow: "0 0 30px rgba(74,222,128,0.25), inset 0 0 16px rgba(74,222,128,0.1)",
          filter: `drop-shadow(0 0 12px rgba(74,222,128,${likeOpacity * 0.8}))`,
        }}
      >
        LIKE ♥
      </div>

      {/* NOPE stamp */}
      <div
        className="pointer-events-none absolute right-6 top-8 z-10 rotate-[22deg] rounded-2xl border-[3px] border-red-400 px-4 py-2 font-mono text-xl font-black uppercase tracking-widest text-red-400"
        style={{
          opacity: skipOpacity,
          transition: dragging ? "none" : "opacity 0.2s",
          textShadow: "0 0 30px rgba(248,113,113,0.9), 0 0 60px rgba(248,113,113,0.4)",
          boxShadow: "0 0 30px rgba(248,113,113,0.25), inset 0 0 16px rgba(248,113,113,0.1)",
          filter: `drop-shadow(0 0 12px rgba(248,113,113,${skipOpacity * 0.8}))`,
        }}
      >
        NOPE ✕
      </div>

      {/* Card */}
      <div
        ref={cardRef}
        className="mx-auto max-w-md overflow-hidden rounded-2xl"
        style={{
          ...cardStyle,
          background: "rgba(11,11,20,0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: `1px solid ${borderColor}`,
          boxShadow: glowShadow,
          transformStyle: "preserve-3d",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      >
        {/* Avatar hero */}
        <div className="relative h-80 w-full overflow-hidden" style={{ background: "#0c0c18" }}>
          <img
            src={dev.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${dev._id}`}
            alt={dev.name}
            className="h-full w-full object-cover"
            style={{ transform: dragging ? "scale(1.05)" : "scale(1)", transition: "transform 0.6s ease" }}
            draggable={false}
          />

          {/* Multi-layer gradient */}
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to top, rgba(7,7,14,0.97) 0%, rgba(7,7,14,0.55) 38%, rgba(7,7,14,0.08) 65%, transparent 100%)",
          }} />

          {/* Holographic shine — moves with cursor */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(circle at ${shine.x}% ${shine.y}%, rgba(255,255,255,0.13) 0%, rgba(79,110,247,0.07) 35%, transparent 65%)`,
              mixBlendMode: "screen",
              transition: dragging ? "none" : "background 0.12s ease",
              pointerEvents: "none",
            }}
          />

          {/* Scan line — subtle horizontal sweep */}
          <div
            className="pointer-events-none absolute inset-x-0 h-px"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(79,110,247,0.5), rgba(139,92,246,0.3), transparent)",
              animation: "scanLine 4s ease-in-out infinite",
              top: 0,
            }}
          />

          {/* Name overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <h2
              className="text-2xl font-bold text-white"
              style={{ textShadow: "0 2px 16px rgba(0,0,0,0.9)" }}
            >
              {dev.name}
            </h2>
            {dev.bio && (
              <p className="mt-1 line-clamp-2 text-sm" style={{ color: "rgba(203,213,225,0.8)" }}>
                {dev.bio}
              </p>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {/* Stack */}
          {stack.length > 0 && (
            <div className="mb-4">
              <div className="flex flex-wrap gap-2">
                {visibleStack.map((tech) => (
                  <span key={tech} className="tech-badge">{tech}</span>
                ))}
                {!stackExpanded && hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setStackExpanded(true); }}
                    className="rounded-lg border border-white/10 bg-dark-700 px-2.5 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200"
                  >
                    +{hiddenCount} mais
                  </button>
                )}
                {stackExpanded && stack.length > MAX_VISIBLE_STACK && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setStackExpanded(false); }}
                    className="rounded-lg border border-white/10 bg-dark-700 px-2.5 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200"
                  >
                    ver menos
                  </button>
                )}
              </div>
            </div>
          )}

          {dev.lookingFor?.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {dev.lookingFor.map((item) => (
                <span
                  key={item}
                  className="rounded-lg border border-brand-500/30 bg-brand-500/10 px-2.5 py-0.5 text-xs font-medium text-brand-400"
                >
                  {item}
                </span>
              ))}
            </div>
          )}

          {dev.github && (
            <a
              href={dev.github}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mb-5 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-brand-400"
            >
              <GithubIcon />
              {dev.github.replace("https://github.com/", "@")}
            </a>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => !exitDir && triggerSwipe("left")}
              className="group flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-medium transition-all duration-200 active:scale-95"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.09)",
                color: "rgba(148,163,184,1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(248,113,113,0.1)";
                e.currentTarget.style.borderColor = "rgba(248,113,113,0.4)";
                e.currentTarget.style.color = "rgba(248,113,113,1)";
                e.currentTarget.style.boxShadow = "0 0 20px rgba(248,113,113,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)";
                e.currentTarget.style.color = "rgba(148,163,184,1)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <XIcon />
              Skip
            </button>

            {onFriendRequest && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); if (!exitDir) onFriendRequest(dev._id); }}
                disabled={friendStatus === "sent"}
                className="flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-3 text-sm font-medium transition-all duration-200 active:scale-95 disabled:opacity-60"
                style={
                  friendStatus === "sent"
                    ? { background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", color: "rgba(74,222,128,1)" }
                    : {
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.09)",
                        color: "rgba(148,163,184,1)",
                      }
                }
                title={friendStatus === "sent" ? "Pedido enviado" : "Adicionar amigo"}
              >
                {friendStatus === "sent" ? <CheckIcon /> : <AddPersonIcon />}
              </button>
            )}

            <button
              onClick={() => !exitDir && triggerSwipe("right")}
              className="group flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-medium text-white transition-all duration-200 active:scale-95"
              style={{
                background: "linear-gradient(135deg, #4f6ef7 0%, #6366f1 100%)",
                boxShadow: "0 4px 20px rgba(79,110,247,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
                border: "1px solid rgba(79,110,247,0.3)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 4px 30px rgba(79,110,247,0.55), 0 0 60px rgba(79,110,247,0.2), inset 0 1px 0 rgba(255,255,255,0.18)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 4px 20px rgba(79,110,247,0.35), inset 0 1px 0 rgba(255,255,255,0.18)";
              }}
            >
              <HeartIcon />
              Like
            </button>
          </div>
        </div>
      </div>

      {/* Drag hint */}
      {!exitDir && offset.x === 0 && !dragging && (
        <p className="mt-4 text-center text-xs text-slate-600 animate-fade-in">
          ← arrasta para skip &nbsp;·&nbsp; arrasta para like →
        </p>
      )}
    </div>
  );
}

function HeartIcon() {
  return (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
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

function AddPersonIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
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
