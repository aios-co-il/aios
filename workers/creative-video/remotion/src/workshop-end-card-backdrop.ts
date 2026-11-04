/**
 * What plays behind the closing card (workshop-end-card-background.tsx draws it): the names
 * Carmen can choose and each background's motion as pure numbers per frame. No Remotion
 * import, so every background is tested without rendering; positions are fractions of the
 * frame and stay inside it.
 */
import { clamp01 } from "./workshop-transition-fx";

/** The backgrounds, in the order Carmen's tools list them (render-worker film-look.ts). */
export const END_CARD_BACKGROUNDS = [
  "last-scene",
  "gradient",
  "pattern",
  "particles",
  "light-rays",
  "plain",
] as const;

export type EndCardBackground = (typeof END_CARD_BACKGROUNDS)[number];

/** The chosen background; a film without a known choice keeps its last scene behind the card. */
export const endCardBackgroundOf = (value: unknown): EndCardBackground =>
  typeof value === "string" &&
  (END_CARD_BACKGROUNDS as readonly string[]).includes(value)
    ? (value as EndCardBackground)
    : "last-scene";

/**
 * The background's two brand colours, lifted so a dark brand colour still glows on dark: the
 * accent, and the brand's second colour, else one turned from the accent around the wheel.
 */
export const brandPair = (
  accent: string,
  secondary?: string | null,
): [string, string] => [
  `oklch(from ${accent} max(l, 0.62) c h)`,
  secondary
    ? `oklch(from ${secondary} max(l, 0.62) c h)`
    : `oklch(from ${accent} max(l, 0.74) c calc(h + 55))`,
];

const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;

/** The last scene behind the card: it goes out of focus and dark, then pushes in slowly. */
export function lastSceneLook(frame: number) {
  const settle = easeOut(frame / 20);
  return {
    blur: 24 * settle,
    scale: 1.06 + 0.12 * clamp01(frame / 300),
    dim: 0.52 * settle,
  };
}

/** A soft blob of one brand colour (0: accent, 1: second): centre and radius as fractions. */
export type Blob = { x: number; y: number; r: number; colour: 0 | 1 };

/** Each blob's resting place, how far and how fast it wanders, and its size. */
const BLOBS = [
  { cx: 0.28, cy: 0.3, ax: 0.14, ay: 0.1, speed: 1, phase: 0, r: 0.5 },
  { cx: 0.74, cy: 0.62, ax: 0.12, ay: 0.14, speed: 0.8, phase: 2.1, r: 0.46 },
  { cx: 0.6, cy: 0.18, ax: 0.16, ay: 0.08, speed: 1.2, phase: 4.2, r: 0.36 },
  { cx: 0.32, cy: 0.8, ax: 0.12, ay: 0.1, speed: 0.9, phase: 1.3, r: 0.4 },
] as const;

/** The gradient's blobs at `frame`: each drifts on its own slow loop around its place. */
export const blobsAt = (frame: number, fps = 30): Blob[] =>
  BLOBS.map((blob, index) => {
    const t = (frame / fps) * 0.45 * blob.speed + blob.phase;
    return {
      x: blob.cx + blob.ax * Math.sin(t),
      y: blob.cy + blob.ay * Math.cos(t * 0.8),
      r: blob.r,
      colour: (index % 2) as 0 | 1,
    };
  });

/** How far the pattern has drifted at `frame`, in px within one `tile`: it loops seamlessly. */
export const patternDrift = (frame: number, tile: number, fps = 30) => {
  const t = frame / fps;
  const wrap = (px: number) => ((px % tile) + tile) % tile;
  return { x: wrap(t * tile * 0.12), y: wrap(t * tile * 0.07) };
};

/** A ray of light from above: its tilt in degrees, where it starts across the top, and its glow. */
export type Ray = { angle: number; x: number; width: number; opacity: number };

const RAYS = [
  { x: 0.18, angle: -22, width: 0.16, phase: 0 },
  { x: 0.38, angle: -8, width: 0.1, phase: 1.7 },
  { x: 0.55, angle: 6, width: 0.2, phase: 3.1 },
  { x: 0.72, angle: 18, width: 0.12, phase: 4.4 },
  { x: 0.88, angle: 30, width: 0.14, phase: 5.6 },
] as const;

/** The rays at `frame`: each sweeps a few degrees to and fro and breathes in brightness. */
export const raysAt = (frame: number, fps = 30): Ray[] =>
  RAYS.map((ray) => {
    const t = (frame / fps) * 0.5 + ray.phase;
    return {
      angle: ray.angle + 7 * Math.sin(t),
      x: ray.x,
      width: ray.width,
      opacity: 0.4 + 0.18 * Math.sin(t * 1.3 + 1),
    };
  });
