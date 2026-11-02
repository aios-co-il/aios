import type { CSSProperties } from "react";
import { Easing, interpolate, spring } from "remotion";
import type { WorkshopTransition } from "./manifest";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/**
 * How an incoming scene draws over the outgoing one during its first `frames` frames.
 * Hebrew reads right to left: a slide brings the next page in from the left, as an RTL
 * carousel does, and a wipe reveals the picture from right to left.
 */
export function enterStyle(
  type: WorkshopTransition,
  frame: number,
  frames: number,
): CSSProperties {
  // A skin switch draws itself (skinEnter): no fade or move of the whole scene.
  if (type === "cut" || type === "skin" || frames <= 0) return {};
  const p = interpolate(frame, [0, frames], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  if (p >= 1) return {};
  if (type === "slide")
    return {
      transform: `translateX(${(p - 1) * 100}%)`,
      boxShadow: "0 0 60px rgba(0,0,0,0.55)",
    };
  if (type === "wipe") return { clipPath: `inset(0 0 0 ${(1 - p) * 100}%)` };
  if (type === "zoom")
    return { opacity: p, transform: `scale(${1.25 - 0.25 * p})` };
  return { opacity: p };
}

/**
 * A skin switch (the same character in another picture) over `frames` frames: the outgoing
 * picture punches in and brightens into a flash, the incoming one appears at the flash's peak
 * (half way, where the cut's whoosh swells) and pops in from larger while a light sweeps across
 * it from right to left.
 */
export function skinEnter(frame: number, frames: number, fps: number) {
  const peak = Math.floor(frames / 2);
  const shown = frame >= peak;
  const pop = shown
    ? spring({
        frame: frame - peak,
        fps,
        config: { damping: 11, mass: 0.5, stiffness: 210 },
      })
    : 0;
  // Up to white at the peak, then a quick fall: the flash itself lasts about a third of a second.
  const flash =
    frame < peak
      ? interpolate(frame, [0, Math.max(1, peak)], [0, 1], {
          ...clamp,
          easing: Easing.in(Easing.quad),
        })
      : interpolate(frame, [peak, peak + 7], [1, 0], {
          ...clamp,
          easing: Easing.out(Easing.cubic),
        });
  // The sweep's centre, in % of the width: from past the right edge to past the left one.
  const sweep = interpolate(frame, [peak + 1, peak + 16], [130, -30], clamp);
  return {
    shown,
    // A little overscan, so the spring's bounce never shrinks the picture past the frame.
    scale: shown ? 1.04 + 0.18 * (1 - pop) : 1.04,
    blur: shown ? interpolate(frame, [peak, peak + 5], [10, 0], clamp) : 0,
    flash,
    sweep: frame > peak && frame <= peak + 16 ? sweep : null,
  };
}

/** The outgoing picture over the last `frames` frames before a skin switch. */
export function skinExit(frame: number, total: number, frames: number) {
  if (frames <= 0) return { scale: 1, brightness: 1, blur: 0 };
  const p = interpolate(frame, [total - frames, total - frames / 2], [0, 1], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });
  return { scale: 1 + 0.1 * p, brightness: 1 + 0.9 * p, blur: 8 * p };
}

/** Opacity of a fade from black at the start and to black at the end. */
export const edgeFade = (frame: number, total: number, frames = 12) =>
  Math.min(
    interpolate(frame, [0, frames], [0, 1], clamp),
    interpolate(frame, [total - frames, total], [1, 0], clamp),
  );
