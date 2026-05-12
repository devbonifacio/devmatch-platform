import AuroraBg from "./AuroraBg";

/** Full-page auth wrapper with aurora background */
export function AuthLayout({ title, subtitle, children }) {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-6 py-12 overflow-hidden"
      style={{ background: "#0a0a0f" }}
    >
      {/* Aurora background */}
      <AuroraBg variant="auth" />

      {/* Subtle grid overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          backgroundImage: "radial-gradient(rgba(255,255,255,0.028) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          zIndex: 0,
        }}
      />

      <div className="relative z-10 w-full max-w-sm animate-page-enter">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black text-white animate-float"
              style={{
                background: "linear-gradient(135deg, #4f6ef7 0%, #6366f1 100%)",
                boxShadow: "0 0 24px rgba(79,110,247,0.5), 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}
            >
              D
            </span>
            <span className="text-xl font-bold">
              <span className="text-white">Dev</span>
              <span
                style={{
                  background: "linear-gradient(135deg, #818cf8, #c7d2fe)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Match
              </span>
            </span>
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-7"
          style={{
            background: "rgba(12, 12, 20, 0.85)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow:
              "0 0 0 1px rgba(79,110,247,0.12), 0 4px 6px rgba(0,0,0,0.5), 0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)",
          }}
        >
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          {children}
        </div>

        {/* Bottom glow reflection */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: "-40px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "60%",
            height: "40px",
            background: "rgba(79,110,247,0.15)",
            filter: "blur(20px)",
            borderRadius: "50%",
          }}
        />
      </div>
    </div>
  );
}

/** Labelled form field wrapper */
export function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium uppercase tracking-wider text-slate-600">
          {label}
        </label>
        {hint && <span className="text-xs text-slate-700">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** Inline error banner */
export function ErrorBanner({ message }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-sm text-red-400 animate-fade-in"
      style={{
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.2)",
      }}
    >
      {message}
    </div>
  );
}

/** Button loading spinner */
export function Spinner() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      A carregar...
    </span>
  );
}
