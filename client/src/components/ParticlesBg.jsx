import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 72;
const CONNECT_DIST   = 130;
const REPEL_DIST     = 110;
const MAX_SPEED      = 1.4;

/**
 * ParticlesBg — canvas particles network with mouse repulsion.
 * Particles flee from the cursor and connect when close to each other.
 */
export default function ParticlesBg() {
  const canvasRef = useRef(null);
  const mouse     = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const onMouse = (e) => { mouse.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("resize",    resize,  { passive: true });
    window.addEventListener("mousemove", onMouse, { passive: true });

    // Initialise particles
    const pts = Array.from({ length: PARTICLE_COUNT }, () => ({
      x:  Math.random() * canvas.width,
      y:  Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r:  Math.random() * 1.2 + 0.4,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const { x: mx, y: my } = mouse.current;

      for (const p of pts) {
        // Mouse repulsion
        const dx = p.x - mx;
        const dy = p.y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < REPEL_DIST * REPEL_DIST && d2 > 0) {
          const d = Math.sqrt(d2);
          const force = ((REPEL_DIST - d) / REPEL_DIST) * 0.9;
          p.vx += (dx / d) * force;
          p.vy += (dy / d) * force;
        }

        // Damping
        p.vx *= 0.975;
        p.vy *= 0.975;

        // Speed cap
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > MAX_SPEED) {
          p.vx = (p.vx / speed) * MAX_SPEED;
          p.vy = (p.vy / speed) * MAX_SPEED;
        }

        p.x += p.vx;
        p.y += p.vy;

        // Soft bounce off edges
        if (p.x < 0)            { p.x = 0;            p.vx = Math.abs(p.vx); }
        if (p.x > canvas.width) { p.x = canvas.width;  p.vx = -Math.abs(p.vx); }
        if (p.y < 0)            { p.y = 0;            p.vy = Math.abs(p.vy); }
        if (p.y > canvas.height){ p.y = canvas.height; p.vy = -Math.abs(p.vy); }

        // Dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(99,122,255,0.55)";
        ctx.fill();
      }

      // Connections
      for (let i = 0; i < pts.length - 1; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < CONNECT_DIST * CONNECT_DIST) {
            const a = (1 - Math.sqrt(d2) / CONNECT_DIST) * 0.2;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(79,110,247,${a})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      raf = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize",    resize);
      window.removeEventListener("mousemove", onMouse);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        opacity: 0.75,
      }}
    />
  );
}
