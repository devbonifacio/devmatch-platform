import { useEffect, useRef, useState } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#@$%&!?";

/**
 * useScramble — animates text by scrambling characters then resolving left→right.
 * @param {string} text     — the target string
 * @param {number} duration — total animation time in ms  (default 900)
 * @param {number} delay    — delay before starting in ms (default 0)
 */
export function useScramble(text, { duration = 900, delay = 0 } = {}) {
  const [display, setDisplay] = useState(() => scramble(text, 0));
  const raf    = useRef(null);
  const timer  = useRef(null);

  useEffect(() => {
    setDisplay(scramble(text, 0));

    timer.current = setTimeout(() => {
      let start = null;

      const run = (ts) => {
        if (!start) start = ts;
        const progress = Math.min((ts - start) / duration, 1);
        setDisplay(scramble(text, progress));
        if (progress < 1) {
          raf.current = requestAnimationFrame(run);
        }
      };

      raf.current = requestAnimationFrame(run);
    }, delay);

    return () => {
      clearTimeout(timer.current);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [text, duration, delay]);

  return display;
}

function scramble(text, progress) {
  const resolved = Math.floor(progress * text.length);
  return text
    .split("")
    .map((ch, i) => {
      if (ch === " ") return " ";
      if (i < resolved) return ch;
      return CHARS[Math.floor(Math.random() * CHARS.length)];
    })
    .join("");
}
