/**
 * The pieces of the overlays made of many small elements (bubbles, particles, confetti), as
 * pure numbers per frame, seeded by the scene's id (workshop-overlays.ts names the overlays).
 * Each draws at most MAX_OVERLAY_ELEMENTS elements, to stay cheap to render.
 */

import type { SceneOverlay } from "./workshop-overlays";

export const MAX_OVERLAY_ELEMENTS = 60;

/** How many elements the overlays made of pieces draw. */
export const PIECES: Record<"bubbles" | "particles" | "confetti", number> = {
  bubbles: 26,
  particles: 34,
  confetti: 60,
};

/** One piece at a frame: centre and size in px, rotation in degrees, `flip` its 3D tilt (-1–1). */
export type Piece = {
  x: number;
  y: number;
  size: number;
  opacity: number;
  rotate: number;
  flip: number;
  /** Which of the overlay's colours it takes (0, 1 or 2). */
  tone: number;
  /** Soft-edged, out of focus. */
  soft: boolean;
};

/** A seed from a scene's id (FNV-1a). */
export function seedOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

/** A stream of numbers in [0, 1) from a seed (mulberry32): the same seed, the same stream. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const wrap = (x: number, span: number) => ((x % span) + span) % span;

type Frame = { width: number; height: number; fps: number };

/** Rising bubbles: they wobble as they rise, already spread over the frame, and fade at the top. */
function bubbles(rand: () => number, t: number, f: Frame): Piece[] {
  const unit = Math.min(f.width, f.height);
  return Array.from({ length: PIECES.bubbles }, () => {
    const size = unit * (0.028 + 0.07 * rand() ** 2);
    const span = f.height + 2 * size;
    // Small bubbles rise slower; each crosses the frame in 3 to 7 seconds.
    const speed = (span / (7 - 4 * rand())) * (0.7 + size / unit);
    const y = f.height + size - wrap(rand() * span + t * speed, span);
    const wobble = Math.sin(t * (1.6 + 1.8 * rand()) + rand() * 6.3);
    const x = rand() * f.width + wobble * size * 0.9;
    const fade = clamp01(y / (f.height * 0.3));
    return {
      x,
      y,
      size,
      opacity: (0.65 + 0.35 * rand()) * fade,
      rotate: 0,
      flip: 1,
      tone: 0,
      soft: false,
    };
  });
}

/** Floating dust and bokeh: slow drift and twinkle, a few large ones out of focus. */
function particles(rand: () => number, t: number, f: Frame): Piece[] {
  const unit = Math.min(f.width, f.height);
  return Array.from({ length: PIECES.particles }, (_, i) => {
    const soft = i % 5 === 0;
    const size = unit * (soft ? 0.06 + 0.06 * rand() : 0.01 + 0.016 * rand());
    const x = wrap(
      rand() * f.width + t * unit * (rand() - 0.5) * 0.05,
      f.width,
    );
    const y = wrap(
      rand() * f.height - t * unit * (0.01 + 0.03 * rand()),
      f.height,
    );
    const twinkle =
      0.5 + 0.5 * Math.sin(t * (0.8 + 1.6 * rand()) + rand() * 6.3);
    const opacity = (soft ? 0.3 : 0.5) + (soft ? 0.2 : 0.5) * twinkle;
    return {
      x,
      y,
      size,
      opacity,
      rotate: 0,
      flip: 1,
      tone: i % 3 === 0 ? 1 : 0,
      soft,
    };
  });
}

/** Confetti: one burst at the scene's start that slows in the air and flutters down out of frame. */
function confetti(rand: () => number, t: number, f: Frame): Piece[] {
  const unit = Math.min(f.width, f.height);
  const drag = 2.2;
  const fall = f.height * 0.42;
  const decay = (1 - Math.exp(-drag * t)) / drag;
  return Array.from({ length: PIECES.confetti }, (_, i) => {
    // Two bursts, from the lower corners, up and towards the middle.
    const side = i % 2 === 0 ? 1 : -1;
    const angle = (Math.PI / 180) * (60 + 25 * rand());
    const speed = f.height * (1.6 + 1.4 * rand());
    const vx = -side * Math.cos(angle) * speed * (f.width / f.height) ** 0.5;
    const vy = -Math.sin(angle) * speed;
    const sway =
      Math.sin(t * (3 + 3 * rand()) + rand() * 6.3) * unit * 0.02 * clamp01(t);
    const x = f.width * (0.5 + side * 0.5) + vx * decay + sway;
    const y = f.height * 1.02 + fall * t + (vy - fall) * decay;
    const size = unit * (0.026 + 0.022 * rand());
    const spin = (rand() - 0.5) * 900;
    return {
      x,
      y,
      size,
      opacity: 1,
      rotate: rand() * 360 + spin * t,
      flip: Math.cos(t * (5 + 7 * rand()) + rand() * 6.3),
      tone: i % 3,
      soft: false,
    };
  });
}

/**
 * The pieces of a scene's overlay `t` seconds after the scene's own start (before it: none for
 * confetti, which bursts then), for a frame of `width` x `height` at `fps`.
 */
export function overlayPieces(
  overlay: SceneOverlay,
  sceneId: string,
  t: number,
  frame: Frame,
): Piece[] {
  const rand = random(seedOf(`${overlay}:${sceneId}`));
  if (overlay === "bubbles") return bubbles(rand, t, frame);
  if (overlay === "particles") return particles(rand, t, frame);
  if (overlay === "confetti") return t < 0 ? [] : confetti(rand, t, frame);
  return [];
}
