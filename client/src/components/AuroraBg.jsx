/**
 * AuroraBg — animated aurora background using CSS blobs + blur.
 * variant="auth"   → strong, colorful (for login/register)
 * variant="global" → subtle, low-opacity (for main app)
 */
export default function AuroraBg({ variant = "global" }) {
  const isAuth = variant === "auth";

  const blob = (style) => (
    <div style={{ position: "absolute", borderRadius: "50%", willChange: "transform", ...style }} />
  );

  if (isAuth) {
    return (
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        {/* Blue — top-left */}
        {blob({
          top: "-15%", left: "-5%",
          width: "80vmax", height: "80vmax",
          background: "radial-gradient(circle at center, rgba(79,110,247,0.45) 0%, rgba(79,110,247,0.15) 40%, transparent 68%)",
          filter: "blur(64px)",
          animation: "auroraBlob1 16s ease-in-out infinite",
        })}
        {/* Purple — bottom-right */}
        {blob({
          bottom: "-10%", right: "-8%",
          width: "65vmax", height: "65vmax",
          background: "radial-gradient(circle at center, rgba(139,92,246,0.4) 0%, rgba(139,92,246,0.12) 40%, transparent 68%)",
          filter: "blur(72px)",
          animation: "auroraBlob2 20s ease-in-out infinite",
        })}
        {/* Cyan — center-right */}
        {blob({
          top: "30%", right: "10%",
          width: "45vmax", height: "45vmax",
          background: "radial-gradient(circle at center, rgba(34,211,238,0.25) 0%, rgba(34,211,238,0.07) 40%, transparent 68%)",
          filter: "blur(80px)",
          animation: "auroraBlob3 24s ease-in-out infinite",
        })}
        {/* Pink accent — bottom-left */}
        {blob({
          bottom: "15%", left: "20%",
          width: "35vmax", height: "35vmax",
          background: "radial-gradient(circle at center, rgba(236,72,153,0.18) 0%, transparent 65%)",
          filter: "blur(70px)",
          animation: "auroraBlob4 28s ease-in-out infinite",
        })}

        {/* Subtle noise overlay for depth */}
        <div style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E\")",
          backgroundSize: "200px 200px",
          opacity: 0.6,
        }} />
      </div>
    );
  }

  // Global (subtle)
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {blob({
        top: "-20%", left: "-15%",
        width: "90vmax", height: "90vmax",
        background: "radial-gradient(circle at center, rgba(79,110,247,0.09) 0%, transparent 60%)",
        filter: "blur(90px)",
        animation: "auroraBlob1 22s ease-in-out infinite",
      })}
      {blob({
        bottom: "-25%", right: "-15%",
        width: "70vmax", height: "70vmax",
        background: "radial-gradient(circle at center, rgba(139,92,246,0.07) 0%, transparent 60%)",
        filter: "blur(110px)",
        animation: "auroraBlob2 30s ease-in-out infinite",
      })}
    </div>
  );
}
