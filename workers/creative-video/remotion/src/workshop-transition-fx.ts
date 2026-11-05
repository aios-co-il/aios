/**
 * Whip, ripple and glitch (workshop-transitions.ts): they move the pixels themselves, so each
 * frame gives a CSS style for the scene and the strength of the SVG filter that style points to
 * (workshop-transition-filter.tsx). Pure numbers, no Remotion import, so they are tested
 * without rendering.
 */
import type { CSSProperties } from "react";

/** The filter's strength at one frame, in px of the frame; all zero at rest. */
export type TransitionFx = {
  /** Horizontal motion blur (whip). */
  blur: number;
  /** Water-like displacement (ripple) and the wave's phase, which moves it frame by frame. */
  ripple: number;
  phase: number;
  /** Red and blue pulled apart sideways (glitch). */
  split: number;
  /** Horizontal slices shifted sideways (glitch), redrawn from `seed` every frame. */
  slice: number;
  seed: number;
};

type FxLook = { style: CSSProperties; fx: TransitionFx };

const NO_FX: TransitionFx = {
  blur: 0,
  ripple: 0,
  phase: 0,
  split: 0,
  slice: 0,
  seed: 0,
};

const AT_REST: FxLook = { style: {}, fx: NO_FX };

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Remotion's Easing.inOut(Easing.cubic), the CSS transitions' curve. */
export const inOutCubic = (t: number) =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;

/** A whip: slow off the mark, a blur of speed in the middle, a hard stop. */
const inOutQuint = (t: number) =>
  t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;

const outQuad = (t: number) => 1 - (1 - t) ** 2;

/** The blur of a whip at eased progress p: strongest at full speed, half way. */
const whipBlur = (width: number, p: number) => width * 0.05 * 4 * p * (1 - p);

/** Whether a frame of a glitch shows the incoming picture: a stutter, then steady. */
const GLITCH_SHOWN = [1, 0, 1, 1, 0, 1, 0, 1];

/** An entrance through the filter, `frame` of `frames` in; null for the CSS transitions. */
export function fxEnter(
  type: string,
  frame: number,
  frames: number,
  width: number,
): FxLook | null {
  const t = clamp01(frame / Math.max(1, frames));
  if (type === "whip") {
    // In from the left (Hebrew reads right to left), pushing the outgoing picture out.
    const p = inOutQuint(t);
    if (p >= 1) return AT_REST;
    return {
      style: { transform: `translateX(${((p - 1) * 100).toFixed(2)}%)` },
      fx: { ...NO_FX, blur: whipBlur(width, p) },
    };
  }
  if (type === "ripple") {
    // A circle of the new picture spreads from the centre, wavering like water, and calms as
    // it fills the frame.
    if (t >= 1) return AT_REST;
    const p = outQuad(t);
    const edge = p * 128;
    const mask = `radial-gradient(circle at 50% 50%, #000 ${Math.max(0, edge - 26).toFixed(1)}%, rgba(0,0,0,0) ${edge.toFixed(1)}%)`;
    return {
      style: {
        WebkitMaskImage: mask,
        maskImage: mask,
        transform: `scale(${(1.08 - 0.08 * p).toFixed(4)})`,
      },
      fx: { ...NO_FX, ripple: width * 0.06 * (1 - t), phase: frame },
    };
  }
  if (type === "glitch") {
    if (t >= 1) return AT_REST;
    const left = 1 - t;
    const shown = t > 0.6 || GLITCH_SHOWN[frame % GLITCH_SHOWN.length] === 1;
    return {
      style: {
        opacity: shown ? 1 : 0,
        transform: `translateX(${(jitter(frame) * left * 2.5).toFixed(2)}%)`,
      },
      fx: glitchFx(width, left, frame),
    };
  }
  return null;
}

/** The outgoing scene `frame` of the `frames` the next one takes to enter; null if it holds. */
export function fxExit(
  type: string,
  frame: number,
  frames: number,
  width: number,
): FxLook | null {
  const t = clamp01(frame / Math.max(1, frames));
  if (type === "whip") {
    // Pushed out to the right by the incoming picture.
    const p = inOutQuint(t);
    return {
      style: { transform: `translateX(${(p * 100).toFixed(2)}%)` },
      fx: { ...NO_FX, blur: whipBlur(width, p) },
    };
  }
  if (type === "glitch") {
    // The picture breaks up towards the cut, under the incoming one's stutter.
    return { style: {}, fx: glitchFx(width, t, frame) };
  }
  return null;
}

/** A glitch frame at `strength` (0–1): slices jump and the colours split. */
const glitchFx = (
  width: number,
  strength: number,
  frame: number,
): TransitionFx => ({
  ...NO_FX,
  split: width * 0.022 * strength,
  slice: width * 0.12 * strength * (0.5 + 0.5 * Math.abs(jitter(frame + 3))),
  seed: frame + 1,
});

/** A repeatable jump between -1 and 1 for each frame. */
const jitter = (frame: number) => {
  const x = Math.sin(frame * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};
