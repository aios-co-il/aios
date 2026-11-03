/**
 * The frosted-glass panel the closing card's logo and call to action can sit on
 * (FilmLook.endCardGlass; workshop-end-card-glass-panel.tsx draws it): its look and its gentle
 * entrance, as pure values so they are tested without rendering.
 */
import type { CSSProperties } from "react";
import { clamp01 } from "./workshop-transition-fx";

/** How wide the panel is, as a share of the frame: narrower on a wide frame. */
export const glassWidth = (width: number, height: number) =>
  width > height ? 0.62 : 0.88;

/**
 * The share of a design's own text width left on the panel (1 without glass): the panel's
 * width less its padding, over the 92% a design's text may take without it.
 */
export const glassFit = (width: number, height: number, glass: boolean) =>
  glass ? (glassWidth(width, height) - 0.1) / 0.92 : 1;

/** The panel's entrance at `frame`: from a little smaller and transparent to at rest. */
export function glassEntrance(frame: number, delay = 2, frames = 18) {
  const p = 1 - (1 - clamp01((frame - delay) / frames)) ** 3;
  return { opacity: p, scale: 0.94 + 0.06 * p, lift: (1 - p) * 0.02 };
}

/**
 * Frosted glass: what lies behind is blurred and brightened, a thin white fill and border, a
 * brighter top edge, and a soft shadow. `tint` fills it with a colour instead of white (the
 * split card's accent half).
 */
export const glassStyle = (unit: number, tint?: string): CSSProperties => {
  const blur = "blur(18px) saturate(140%)";
  return {
    background: tint
      ? `linear-gradient(180deg, color-mix(in srgb, ${tint} 82%, white), color-mix(in srgb, ${tint} 66%, transparent))`
      : "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.10) 100%)",
    backdropFilter: blur,
    WebkitBackdropFilter: blur,
    border: "1px solid rgba(255,255,255,0.24)",
    borderTopColor: "rgba(255,255,255,0.5)",
    borderRadius: Math.round(unit * 0.045),
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.35), 0 24px 60px rgba(0,0,0,0.35)",
  };
};
