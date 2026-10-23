import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export type CardPosition = { x: number; y: number };

/** Keeps a card of `size` fully inside the viewport, with a small margin. */
export function clampCardPosition(
  pos: CardPosition,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8,
): CardPosition {
  const maxX = Math.max(margin, viewport.width - size.width - margin);
  const maxY = Math.max(margin, viewport.height - size.height - margin);
  return {
    x: Math.min(Math.max(pos.x, margin), maxX),
    y: Math.min(Math.max(pos.y, margin), maxY),
  };
}

function readStored(key: string, fallback: CardPosition): CardPosition {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

/**
 * Drag a fixed-position card around the screen (like a Zoom video window).
 * The last position is remembered per browser.
 */
export function useDraggableCard(storageKey: string, fallback: CardPosition) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CardPosition>(() =>
    readStored(storageKey, fallback),
  );
  const drag = useRef<{ dx: number; dy: number; id: number } | null>(null);

  const clampToView = useCallback((p: CardPosition) => {
    const el = ref.current;
    return clampCardPosition(
      p,
      { width: el?.offsetWidth ?? 0, height: el?.offsetHeight ?? 0 },
      { width: window.innerWidth, height: window.innerHeight },
    );
  }, []);

  // Keep the card visible after a window resize.
  useEffect(() => {
    const onResize = () => setPos((p) => clampToView(p));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampToView]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Buttons inside the card keep working as buttons.
    if ((e.target as HTMLElement).closest("button, a")) return;
    drag.current = {
      dx: e.clientX - pos.x,
      dy: e.clientY - pos.y,
      id: e.pointerId,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setPos(clampToView({ x: e.clientX - d.dx, y: e.clientY - d.dy }));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setPos((p) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(p));
      } catch {
        /* ignore */
      }
      return p;
    });
  };

  return {
    ref,
    style: { left: pos.x, top: pos.y },
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
