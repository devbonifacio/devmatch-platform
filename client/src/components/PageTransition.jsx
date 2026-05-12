import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";

/**
 * Navigation order for the main tabs.
 * Pages with higher index slide "left" when going forward,
 * and "right" when going back. Sub-pages (chat) slide up.
 */
const NAV_ORDER = {
  "/login":    -2,
  "/register": -1,
  "/discover":  0,
  "/matches":   1,
  "/profile":   2,
};

const isSubPage = (path) => path.startsWith("/chat/");

function getDirection(from, to) {
  if (isSubPage(to))   return "up";    // entering a sub-page  → slide up
  if (isSubPage(from)) return "down";  // leaving a sub-page   → slide down

  const a = NAV_ORDER[from] ?? 0;
  const b = NAV_ORDER[to]   ?? 0;
  if (a === b) return "fade";
  return b > a ? "left" : "right";
}

function buildVariants(dir) {
  const dist = 28;
  const map = {
    left:  { initial: { x:  dist, opacity: 0, filter: "blur(6px)", scale: 0.985 },
              exit:    { x: -dist * 0.6, opacity: 0, filter: "blur(4px)", scale: 0.99 } },
    right: { initial: { x: -dist, opacity: 0, filter: "blur(6px)", scale: 0.985 },
              exit:    { x:  dist * 0.6, opacity: 0, filter: "blur(4px)", scale: 0.99 } },
    up:    { initial: { y:  dist, opacity: 0, filter: "blur(6px)", scale: 0.98  },
              exit:    { y: -dist * 0.5, opacity: 0, filter: "blur(4px)", scale: 0.99 } },
    down:  { initial: { y: -dist, opacity: 0, filter: "blur(6px)", scale: 0.98  },
              exit:    { y:  dist * 0.5, opacity: 0, filter: "blur(4px)", scale: 0.99 } },
    fade:  { initial: { opacity: 0, filter: "blur(4px)", scale: 0.99 },
              exit:    { opacity: 0, filter: "blur(4px)", scale: 1.01 } },
  };
  return map[dir] || map.fade;
}

const animate = { x: 0, y: 0, opacity: 1, filter: "blur(0px)", scale: 1 };

const spring = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 };
const ease   = { duration: 0.28, ease: [0.16, 1, 0.3, 1] };

/**
 * Wrap this around the <Routes> block in App.jsx.
 * Pass `location` from useLocation() so AnimatePresence gets the right key.
 */
export function AnimatedRoutes({ children, location }) {
  const prevPath = useRef(location.pathname);

  const dir      = getDirection(prevPath.current, location.pathname);
  const variants = buildVariants(dir);

  // Update prevPath *after* computing direction (before next render)
  prevPath.current = location.pathname;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.key}
        initial={variants.initial}
        animate={animate}
        exit={variants.exit}
        transition={dir === "fade" ? ease : spring}
        style={{ height: "100%", display: "flex", flexDirection: "column" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
