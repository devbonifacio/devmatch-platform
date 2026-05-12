import { useEffect, useRef } from "react";

/**
 * SpotlightCursor — radial light that tracks the mouse.
 * Creates the "illuminated" effect seen in Linear, Vercel, Raycast.
 */
export default function SpotlightCursor() {
  const ref = useRef(null);
  const pos = useRef({ x: -2000, y: -2000 });

  useEffect(() => {
    let frame;

    const onMove = (e) => {
      pos.current = { x: e.clientX, y: e.clientY };
    };

    const tick = () => {
      if (ref.current) {
        const { x, y } = pos.current;
        ref.current.style.background = [
          `radial-gradient(650px circle at ${x}px ${y}px,`,
          `  rgba(79,110,247,0.11) 0%,`,
          `  rgba(79,110,247,0.04) 35%,`,
          `  transparent 68%`,
          `)`,
        ].join(" ");
      }
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3,
        pointerEvents: "none",
      }}
    />
  );
}
