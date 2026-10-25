import type { CSSProperties } from "react";
import { Easing, interpolate } from "remotion";
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
  if (type === "cut" || frames <= 0) return {};
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

/** Opacity of a fade from black at the start and to black at the end. */
export const edgeFade = (frame: number, total: number, frames = 12) =>
  Math.min(
    interpolate(frame, [0, frames], [0, 1], clamp),
    interpolate(frame, [total - frames, total], [1, 0], clamp),
  );
