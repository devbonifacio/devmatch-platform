import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

/**
 * VoiceCall — WebRTC peer-to-peer voice call component
 * Uses the existing Socket.io connection for signaling.
 * No extra servers needed beyond a STUN server (free, Google's public one).
 */

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function VoiceCall({ socket, matchId, otherUser, currentUser, onClose }) {
  const [callState, setCallState] = useState("idle"); // idle | calling | receiving | active | ended
  const [incomingCall, setIncomingCall] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callError, setCallError] = useState(null);

  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const iceCandidatesQueue = useRef([]);
  const isInitiatorRef = useRef(false);
  const audioCtxRef = useRef(null);
  const ringIntervalRef = useRef(null);

  // ── Cleanup ──────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    clearInterval(durationIntervalRef.current);
    durationIntervalRef.current = null;
    clearInterval(ringIntervalRef.current);
    ringIntervalRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    iceCandidatesQueue.current = [];
    isInitiatorRef.current = false;
  }, []);

  // ── Create RTCPeerConnection ─────────────────────────────────────────
  const createPeer = useCallback(() => {
    const peer = new RTCPeerConnection(ICE_SERVERS);

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit("call:ice-candidate", {
          matchId,
          candidate: event.candidate,
          to: otherUser?._id,
        });
      }
    };

    peer.ontrack = (event) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    peer.oniceconnectionstatechange = () => {
      const state = peer.iceConnectionState;
      if (state === "failed" || state === "disconnected") {
        setCallError("Conexão perdida. Tenta novamente.");
        endCall();
      }
      // "completed" is what Chrome reports after "connected" — handle both
      if ((state === "connected" || state === "completed") && !durationIntervalRef.current) {
        setCallState("active");
        durationIntervalRef.current = setInterval(() => {
          setCallDuration((d) => d + 1);
        }, 1000);
      }
    };

    return peer;
  }, [socket, matchId, otherUser]);

  // ── Start call (initiator) ───────────────────────────────────────────
  const startCall = useCallback(async () => {
    setCallError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      const peer = createPeer();
      peerRef.current = peer;
      isInitiatorRef.current = true;

      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      socket?.emit("call:offer", {
        matchId,
        offer,
        to: otherUser?._id,
        from: { _id: currentUser?._id, name: currentUser?.name },
      });

      setCallState("calling");
    } catch (err) {
      if (err.name === "NotAllowedError") {
        setCallError("Permissão do microfone negada. Permite o acesso nas definições.");
      } else {
        setCallError("Erro ao iniciar chamada: " + err.message);
      }
      cleanup();
    }
  }, [socket, matchId, otherUser, currentUser, createPeer, cleanup]);

  // ── Answer call (receiver) ───────────────────────────────────────────
  const answerCall = useCallback(async () => {
    if (!incomingCall) return;
    setCallError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      const peer = createPeer();
      peerRef.current = peer;

      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      await peer.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));

      // Flush queued candidates
      for (const c of iceCandidatesQueue.current) {
        await peer.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
      iceCandidatesQueue.current = [];

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket?.emit("call:answer", {
        matchId,
        answer,
        to: incomingCall.from?._id ?? incomingCall.from,
      });

      setIncomingCall(null);
      setCallState("active");
      durationIntervalRef.current = setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      setCallError("Erro ao atender: " + err.message);
      cleanup();
      setCallState("idle");
    }
  }, [incomingCall, socket, matchId, createPeer, cleanup]);

  // ── Reject call ──────────────────────────────────────────────────────
  const rejectCall = useCallback(() => {
    socket?.emit("call:reject", { matchId, to: incomingCall?.from?._id ?? incomingCall?.from });
    setIncomingCall(null);
    setCallState("idle");
  }, [socket, matchId, incomingCall]);

  // ── End call ─────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    socket?.emit("call:end", { matchId, to: otherUser?._id });
    cleanup();
    setCallState("ended");
    setCallDuration(0);
    setTimeout(() => setCallState("idle"), 1500);
  }, [socket, matchId, otherUser, cleanup]);

  // ── Toggle mute ──────────────────────────────────────────────────────
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
      setIsMuted((m) => !m);
    }
  };

  // ── Socket event listeners ───────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onOffer = async ({ offer, from }) => {
      setIncomingCall({ offer, from });
      setCallState("receiving");
    };

    const onAnswer = async ({ answer }) => {
      if (peerRef.current) {
        try {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          for (const c of iceCandidatesQueue.current) {
            await peerRef.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          iceCandidatesQueue.current = [];
          // Receiver answered — show active bar immediately, don't wait for ICE
          setCallState("active");
          if (!durationIntervalRef.current) {
            durationIntervalRef.current = setInterval(() => {
              setCallDuration((d) => d + 1);
            }, 1000);
          }
        } catch (e) {
          setCallError("Erro na ligação. Tenta novamente.");
        }
      }
    };

    const onIceCandidate = async ({ candidate }) => {
      if (!peerRef.current || !peerRef.current.remoteDescription) {
        iceCandidatesQueue.current.push(candidate);
        return;
      }
      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {}
    };

    const onCallEnd = () => {
      cleanup();
      setCallState("ended");
      setIncomingCall(null);
      setCallDuration(0);
      setTimeout(() => setCallState("idle"), 1500);
    };

    const onCallReject = () => {
      cleanup();
      setCallState("rejected");
      setTimeout(() => setCallState("idle"), 2000);
    };

    socket.on("call:offer", onOffer);
    socket.on("call:answer", onAnswer);
    socket.on("call:ice-candidate", onIceCandidate);
    socket.on("call:end", onCallEnd);
    socket.on("call:reject", onCallReject);

    return () => {
      socket.off("call:offer", onOffer);
      socket.off("call:answer", onAnswer);
      socket.off("call:ice-candidate", onIceCandidate);
      socket.off("call:end", onCallEnd);
      socket.off("call:reject", onCallReject);
    };
  }, [socket, cleanup]);

  // ── Call sound effects ────────────────────────────────────────────────
  useEffect(() => {
    const getCtx = () => {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
      return audioCtxRef.current;
    };

    const beep = (freq, startOffset, duration, gain = 0.24) => {
      const ctx = getCtx();
      const t = ctx.currentTime + startOffset;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.015);
      g.gain.linearRampToValueAtTime(gain, t + Math.max(duration - 0.02, 0.01));
      g.gain.linearRampToValueAtTime(0, t + duration);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    };

    const stopRing = () => {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    };

    const ringCycle = () => {
      // Classic dual-tone ring: 440 Hz + 480 Hz, two bursts
      beep(440, 0,    0.38, 0.2);
      beep(480, 0,    0.38, 0.2);
      beep(440, 0.44, 0.38, 0.2);
      beep(480, 0.44, 0.38, 0.2);
    };

    if (callState === "calling" || callState === "receiving") {
      stopRing();
      ringCycle();
      ringIntervalRef.current = setInterval(ringCycle, 3000);
    } else if (callState === "active") {
      stopRing();
      // Ascending two-tone connect chime
      beep(880,  0,    0.12, 0.22);
      beep(1108, 0.13, 0.18, 0.22);
    } else if (callState === "ended" || callState === "rejected") {
      stopRing();
      // Descending three-tone disconnect
      beep(600, 0,    0.14, 0.2);
      beep(480, 0.16, 0.14, 0.2);
      beep(360, 0.32, 0.18, 0.2);
    } else {
      stopRing();
    }

    return stopRing;
  }, [callState]);

  // Safety net: ensure mic is always released when returning to idle (e.g., edge-case missed paths)
  useEffect(() => {
    if (callState === "idle" && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  }, [callState]);

  // Cleanup on unmount
  useEffect(() => () => {
    cleanup();
    clearInterval(ringIntervalRef.current);
    audioCtxRef.current?.close();
  }, [cleanup]);

  const formatDuration = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const avatarSrc =
    otherUser?.avatar ||
    `https://api.dicebear.com/7.x/identicon/svg?seed=${otherUser?._id}`;

  // ── Single return — audio element is always mounted so the ref is stable.
  // Overlays are portaled to document.body to escape any ancestor CSS transform
  // (Framer Motion page transitions create a containing block that traps position:fixed).
  return (
    <>
      {/* Always-mounted audio — srcObject set once by ontrack and never lost */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />

      <CallStyles />

      {/* Idle: phone button in the chat header */}
      {callState === "idle" && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div className="vc-trigger-wrap">
            <button onClick={startCall} className="vc-trigger" title="Chamada de voz">
              <PhoneIcon size={16} />
            </button>
            <span className="vc-tooltip">Chamada de voz</span>
          </div>
          {callError && <span className="vc-error">{callError}</span>}
        </div>
      )}

      {/* Calling overlay — portaled to body */}
      {callState === "calling" && createPortal(
        <div className="vc-overlay vc-overlay--calling">
          <div className="vc-card vc-card--calling">
            <div className="vc-avatar-wrap">
              <img src={avatarSrc} alt={otherUser?.name} className="vc-avatar" />
              <span className="vc-ring vc-ring--blue vc-ring--1" />
              <span className="vc-ring vc-ring--blue vc-ring--2" />
              <span className="vc-ring vc-ring--blue vc-ring--3" />
            </div>
            <p className="vc-label">A ligar para</p>
            <h3 className="vc-name">{otherUser?.name}</h3>
            <p className="vc-sub">
              A ligar
              <span className="vc-dot vc-dot--1">.</span>
              <span className="vc-dot vc-dot--2">.</span>
              <span className="vc-dot vc-dot--3">.</span>
            </p>
            <div className="vc-actions">
              <button onClick={endCall} className="vc-btn vc-btn--end" title="Cancelar">
                <PhoneOffIcon size={22} />
              </button>
            </div>
          </div>
          <CallStyles />
        </div>,
        document.body
      )}

      {/* Receiving overlay — portaled to body */}
      {callState === "receiving" && incomingCall && createPortal(
        <div className="vc-overlay vc-overlay--receiving">
          <div className="vc-card vc-card--receiving">
            <div className="vc-avatar-wrap">
              <img src={avatarSrc} alt={otherUser?.name} className="vc-avatar vc-avatar--green" />
              <span className="vc-ring vc-ring--green vc-ring--1" />
              <span className="vc-ring vc-ring--green vc-ring--2" />
            </div>
            <div className="vc-waves">
              <span /><span /><span /><span /><span />
            </div>
            <p className="vc-label">Chamada de voz</p>
            <h3 className="vc-name">{incomingCall.from?.name || otherUser?.name}</h3>
            <div className="vc-actions vc-actions--wide">
              <div className="vc-btn-group">
                <button onClick={rejectCall} className="vc-btn vc-btn--reject" title="Rejeitar">
                  <PhoneOffIcon size={22} />
                </button>
                <span className="vc-btn-hint">Rejeitar</span>
              </div>
              <div className="vc-btn-group">
                <button onClick={answerCall} className="vc-btn vc-btn--accept" title="Atender">
                  <PhoneIcon size={22} />
                </button>
                <span className="vc-btn-hint">Atender</span>
              </div>
            </div>
          </div>
          <CallStyles />
        </div>,
        document.body
      )}

      {/* Active bar — portaled to body */}
      {callState === "active" && createPortal(
        <div className="vc-bar">
          <img src={avatarSrc} alt={otherUser?.name} className="vc-bar-avatar" />
          <div className="vc-bar-info">
            <span className="vc-bar-name">{otherUser?.name}</span>
            <span className="vc-bar-timer">{formatDuration(callDuration)}</span>
          </div>
          <div className="vc-bar-waves">
            <span /><span /><span /><span />
          </div>
          <div className="vc-bar-actions">
            <button
              onClick={toggleMute}
              className={`vc-btn-sm ${isMuted ? "vc-btn-sm--muted" : "vc-btn-sm--ctrl"}`}
              title={isMuted ? "Ativar mic" : "Silenciar"}
            >
              {isMuted ? <MicOffIcon size={15} /> : <MicIcon size={15} />}
            </button>
            <button onClick={endCall} className="vc-btn-sm vc-btn-sm--end" title="Terminar">
              <PhoneOffIcon size={15} />
            </button>
          </div>
          <CallStyles />
        </div>,
        document.body
      )}

      {/* Toast (ended / rejected) — portaled to body */}
      {(callState === "ended" || callState === "rejected") && createPortal(
        <div className={`vc-toast ${callState === "rejected" ? "vc-toast--rejected" : ""}`}>
          <span className="vc-toast-icon"><PhoneOffIcon size={14} /></span>
          {callState === "ended" ? "Chamada terminada" : "Chamada rejeitada"}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PhoneIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}

function PhoneOffIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 3.75L18 6m0 0l2.25 2.25M18 6l2.25-2.25M18 6l-2.25 2.25m1.5 13.5c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 014.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.055.902-.417 1.173l-1.293.97a1.062 1.062 0 00-.38 1.21 12.035 12.035 0 007.143 7.143c.441.162.928-.004 1.21-.38l.97-1.293a1.125 1.125 0 011.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 01-2.25 2.25h-2.25z" />
    </svg>
  );
}

function MicIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  );
}

function MicOffIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
    </svg>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
function CallStyles() {
  return (
    <style>{`
      /* ── Overlay ── */
      .vc-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        animation: vcOverlayIn 0.3s ease forwards;
      }

      @keyframes vcOverlayIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }

      .vc-overlay--calling {
        background: radial-gradient(ellipse at 50% 45%, rgba(79, 110, 247, 0.22) 0%, rgba(6, 6, 20, 0.96) 65%);
      }
      .vc-overlay--calling::before {
        content: '';
        position: absolute;
        top: 50%; left: 50%;
        width: 520px; height: 520px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(79, 110, 247, 0.25) 0%, transparent 65%);
        transform: translate(-50%, -50%);
        animation: vcGlowBlue 3.2s ease-in-out infinite;
        pointer-events: none;
      }
      @keyframes vcGlowBlue {
        0%, 100% { opacity: 0.45; transform: translate(-50%, -50%) scale(1); }
        50%       { opacity: 1;    transform: translate(-50%, -50%) scale(1.45); }
      }

      .vc-overlay--receiving {
        background: radial-gradient(ellipse at 50% 45%, rgba(20, 184, 166, 0.18) 0%, rgba(4, 16, 16, 0.96) 65%);
      }
      .vc-overlay--receiving::before {
        content: '';
        position: absolute;
        top: 50%; left: 50%;
        width: 520px; height: 520px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(20, 184, 166, 0.22) 0%, transparent 65%);
        transform: translate(-50%, -50%);
        animation: vcGlowGreen 3.2s ease-in-out infinite;
        pointer-events: none;
      }
      @keyframes vcGlowGreen {
        0%, 100% { opacity: 0.45; transform: translate(-50%, -50%) scale(1); }
        50%       { opacity: 1;    transform: translate(-50%, -50%) scale(1.45); }
      }

      /* ── Card ── */
      .vc-card {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 48px 44px 40px;
        border-radius: 32px;
        background: rgba(10, 10, 22, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.07);
        box-shadow: 0 32px 80px rgba(0, 0, 0, 0.55);
        min-width: 300px;
        text-align: center;
        animation: vcCardIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }
      .vc-card--calling  { border-color: rgba(79, 110, 247, 0.2); box-shadow: 0 0 80px rgba(79, 110, 247, 0.1), 0 32px 80px rgba(0,0,0,0.55); }
      .vc-card--receiving { border-color: rgba(20, 184, 166, 0.25); box-shadow: 0 0 80px rgba(20, 184, 166, 0.1), 0 32px 80px rgba(0,0,0,0.55); }

      @keyframes vcCardIn {
        from { opacity: 0; transform: translateY(28px) scale(0.9); }
        to   { opacity: 1; transform: translateY(0)    scale(1); }
      }

      /* ── Avatar ── */
      .vc-avatar-wrap {
        position: relative;
        width: 96px;
        height: 96px;
        margin-bottom: 10px;
        flex-shrink: 0;
      }
      .vc-avatar {
        width: 96px;
        height: 96px;
        border-radius: 50%;
        object-fit: cover;
        position: relative;
        z-index: 2;
        border: 3px solid rgba(79, 110, 247, 0.55);
        box-shadow: 0 0 28px rgba(79, 110, 247, 0.25);
      }
      .vc-avatar--green {
        border-color: rgba(52, 211, 153, 0.6);
        box-shadow: 0 0 28px rgba(52, 211, 153, 0.25);
      }

      /* ── Rings ── */
      .vc-ring {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 2px solid transparent;
        pointer-events: none;
      }
      .vc-ring--blue  { border-color: rgba(79, 110, 247, 0.55); animation: vcRingBlue  2.6s ease-out infinite; }
      .vc-ring--green { border-color: rgba(52, 211, 153, 0.55); animation: vcRingGreen 2.6s ease-out infinite; }
      .vc-ring--1 { animation-delay: 0s; }
      .vc-ring--2 { animation-delay: 0.87s; }
      .vc-ring--3 { animation-delay: 1.74s; }

      @keyframes vcRingBlue {
        0%   { transform: scale(1);   opacity: 0.85; }
        100% { transform: scale(2.2); opacity: 0; }
      }
      @keyframes vcRingGreen {
        0%   { transform: scale(1);   opacity: 0.85; }
        100% { transform: scale(2.2); opacity: 0; }
      }

      /* ── Text ── */
      .vc-label {
        font-size: 11px;
        color: rgba(148, 163, 184, 0.65);
        letter-spacing: 0.1em;
        text-transform: uppercase;
        margin: 4px 0 0;
        font-weight: 500;
      }
      .vc-name {
        font-size: 26px;
        font-weight: 700;
        color: #f1f5f9;
        margin: 2px 0 0;
        letter-spacing: -0.025em;
      }
      .vc-sub {
        font-size: 14px;
        color: rgba(148, 163, 184, 0.75);
        margin: 2px 0 0;
        letter-spacing: 0.01em;
      }

      /* ── Animated dots ── */
      .vc-dot { opacity: 0; animation: vcDot 2.1s ease-in-out infinite; }
      .vc-dot--1 { animation-delay: 0s; }
      .vc-dot--2 { animation-delay: 0.4s; }
      .vc-dot--3 { animation-delay: 0.8s; }
      @keyframes vcDot {
        0%, 20%    { opacity: 0; }
        40%, 75%   { opacity: 1; }
        100%       { opacity: 0; }
      }

      /* ── Audio waves (receiving) ── */
      .vc-waves {
        display: flex;
        align-items: flex-end;
        gap: 5px;
        height: 34px;
        margin: 6px 0 2px;
      }
      .vc-waves span {
        width: 4px;
        border-radius: 3px;
        background: rgba(52, 211, 153, 0.65);
        animation: vcWaveBar 0.95s ease-in-out infinite;
        transform-origin: bottom;
      }
      .vc-waves span:nth-child(1) { height: 8px;  animation-delay: 0s; }
      .vc-waves span:nth-child(2) { height: 18px; animation-delay: 0.19s; }
      .vc-waves span:nth-child(3) { height: 30px; animation-delay: 0.38s; }
      .vc-waves span:nth-child(4) { height: 18px; animation-delay: 0.57s; }
      .vc-waves span:nth-child(5) { height: 8px;  animation-delay: 0.76s; }
      @keyframes vcWaveBar {
        0%, 100% { transform: scaleY(0.3); opacity: 0.5; }
        50%       { transform: scaleY(1);   opacity: 1; }
      }

      /* ── Action buttons ── */
      .vc-actions {
        display: flex;
        gap: 20px;
        margin-top: 22px;
      }
      .vc-actions--wide { gap: 36px; }

      .vc-btn-group {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      .vc-btn-hint {
        font-size: 11px;
        color: rgba(148, 163, 184, 0.6);
        letter-spacing: 0.03em;
      }

      .vc-btn {
        width: 68px;
        height: 68px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        cursor: pointer;
        color: white;
        transition: transform 0.18s, box-shadow 0.18s;
        position: relative;
      }
      .vc-btn:active { transform: scale(0.93) !important; }

      .vc-btn--accept {
        background: linear-gradient(145deg, #10b981, #059669);
        box-shadow: 0 8px 28px rgba(16, 185, 129, 0.5);
        animation: vcShake 2.8s ease-in-out infinite;
        animation-delay: 1.2s;
      }
      .vc-btn--accept:hover {
        animation: none;
        transform: scale(1.1);
        box-shadow: 0 10px 32px rgba(16, 185, 129, 0.65);
      }
      .vc-btn--reject {
        background: linear-gradient(145deg, #ef4444, #dc2626);
        box-shadow: 0 8px 28px rgba(239, 68, 68, 0.5);
      }
      .vc-btn--reject:hover { transform: scale(1.1); box-shadow: 0 10px 32px rgba(239,68,68,0.65); }
      .vc-btn--end {
        background: linear-gradient(145deg, #ef4444, #dc2626);
        box-shadow: 0 8px 28px rgba(239, 68, 68, 0.5);
      }
      .vc-btn--end:hover { transform: scale(1.1); box-shadow: 0 10px 32px rgba(239,68,68,0.65); }

      @keyframes vcShake {
        0%, 88%, 100%  { transform: translateX(0) rotate(0deg); }
        90%  { transform: translateX(-4px) rotate(-10deg); }
        92%  { transform: translateX(4px)  rotate(10deg); }
        94%  { transform: translateX(-3px) rotate(-6deg); }
        96%  { transform: translateX(3px)  rotate(6deg); }
        98%  { transform: translateX(-1px) rotate(-2deg); }
      }

      /* ── Active call bar ── */
      .vc-bar {
        position: fixed;
        top: 0; left: 0; right: 0;
        z-index: 9998;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 18px;
        background: rgba(3, 36, 18, 0.88);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-bottom: 1px solid rgba(52, 211, 153, 0.18);
        box-shadow: 0 4px 28px rgba(0, 0, 0, 0.45);
        animation: vcBarSlideIn 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }
      @keyframes vcBarSlideIn {
        from { transform: translateY(-100%); opacity: 0; }
        to   { transform: translateY(0);     opacity: 1; }
      }

      .vc-bar-avatar {
        width: 34px; height: 34px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid rgba(52, 211, 153, 0.45);
        flex-shrink: 0;
      }
      .vc-bar-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }
      .vc-bar-name {
        font-size: 13px;
        font-weight: 600;
        color: #ecfdf5;
        line-height: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .vc-bar-timer {
        font-size: 11px;
        color: #34d399;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        letter-spacing: 0.05em;
        line-height: 1;
        animation: vcTimerPulse 2s ease-in-out infinite;
      }
      @keyframes vcTimerPulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.55; }
      }

      /* ── Bar audio bars ── */
      .vc-bar-waves {
        display: flex;
        align-items: center;
        gap: 3px;
        height: 22px;
        margin: 0 6px;
        flex-shrink: 0;
      }
      .vc-bar-waves span {
        width: 3px;
        border-radius: 2px;
        background: rgba(52, 211, 153, 0.7);
        animation: vcBarWave 0.72s ease-in-out infinite;
        transform-origin: center;
      }
      .vc-bar-waves span:nth-child(1) { height: 7px;  animation-delay: 0s; }
      .vc-bar-waves span:nth-child(2) { height: 15px; animation-delay: 0.18s; }
      .vc-bar-waves span:nth-child(3) { height: 11px; animation-delay: 0.36s; }
      .vc-bar-waves span:nth-child(4) { height: 19px; animation-delay: 0.54s; }
      @keyframes vcBarWave {
        0%, 100% { transform: scaleY(0.28); }
        50%       { transform: scaleY(1); }
      }

      /* ── Small bar buttons ── */
      .vc-bar-actions { display: flex; gap: 8px; flex-shrink: 0; }
      .vc-btn-sm {
        width: 36px; height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        cursor: pointer;
        color: white;
        transition: transform 0.18s, box-shadow 0.18s;
        flex-shrink: 0;
      }
      .vc-btn-sm:hover  { transform: scale(1.12); }
      .vc-btn-sm:active { transform: scale(0.93); }
      .vc-btn-sm--ctrl {
        background: rgba(255, 255, 255, 0.09);
        border: 1px solid rgba(255, 255, 255, 0.14);
        color: rgba(255, 255, 255, 0.8);
      }
      .vc-btn-sm--ctrl:hover { background: rgba(255,255,255,0.14); }
      .vc-btn-sm--muted {
        background: rgba(239, 68, 68, 0.2);
        border: 1px solid rgba(239, 68, 68, 0.4);
        color: #f87171;
      }
      .vc-btn-sm--end {
        background: linear-gradient(145deg, #ef4444, #dc2626);
        box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4);
      }

      /* ── Toast ── */
      .vc-toast {
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 11px 22px;
        background: rgba(12, 12, 26, 0.94);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 50px;
        font-size: 13px;
        color: #94a3b8;
        font-weight: 500;
        white-space: nowrap;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
        animation: vcToastAnim 1.5s ease forwards;
      }
      .vc-toast--rejected {
        animation-duration: 2s;
        border-color: rgba(239, 68, 68, 0.2);
        color: #fca5a5;
      }
      .vc-toast-icon { display: flex; align-items: center; opacity: 0.7; }
      @keyframes vcToastAnim {
        0%   { opacity: 0; transform: translateX(-50%) translateY(10px); }
        14%  { opacity: 1; transform: translateX(-50%) translateY(0); }
        76%  { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-8px); }
      }

      /* ── Idle trigger ── */
      .vc-trigger-wrap { position: relative; display: inline-flex; }
      .vc-trigger {
        width: 34px; height: 34px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(79, 110, 247, 0.35);
        background: rgba(79, 110, 247, 0.08);
        color: #818cf8;
        cursor: pointer;
        transition: all 0.2s;
        flex-shrink: 0;
      }
      .vc-trigger:hover {
        background: rgba(79, 110, 247, 0.18);
        border-color: rgba(79, 110, 247, 0.6);
        color: #a5b4fc;
        transform: scale(1.07);
        box-shadow: 0 0 18px rgba(79, 110, 247, 0.32);
      }
      .vc-trigger:active { transform: scale(0.94); }

      .vc-tooltip {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%);
        background: rgba(10, 10, 20, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 11px;
        color: #cbd5e1;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.18s;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
      .vc-trigger-wrap:hover .vc-tooltip { opacity: 1; }

      /* ── Error ── */
      .vc-error {
        font-size: 11px;
        color: #f87171;
        max-width: 160px;
        line-height: 1.3;
      }
    `}</style>
  );
}
