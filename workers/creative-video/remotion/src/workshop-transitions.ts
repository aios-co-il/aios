/**
 * The transitions into a Workshop scene and how a scene looks while it enters and while the
 * next one enters over it. Pure numbers per frame (no Remotion import), so every transition is
 * tested without rendering: at rest the style is empty and there is no filter.
 */
import type { CSSProperties } from "react";
import {
  clamp01,
  fxEnter,
  fxExit,
  inOutCubic,
  type TransitionFx,
} from "./workshop-transition-fx";

/**
 * Every transition into a scene (manifest.ts WorkshopScene.transition). Carmen chooses all but
 * "skin", which the render worker picks for a skin switch (skin-switch.ts); whip, ripple and
 * glitch are drawn through an SVG filter (workshop-transition-fx.ts).
 */
export const WORKSHOP_TRANSITIONS = [
  "cut",
  "crossfade",
  "slide",
  "wipe",
  "zoom",
  "skin",
  "whip",
  "ripple",
  "glitch",
] as const;

/** "skin": the same character in another picture (flash, scale pop and light sweep). */
export type WorkshopTransition = (typeof WORKSHOP_TRANSITIONS)[number];

export type TransitionLook = { style: CSSProperties; fx: TransitionFx | null };

const REST: TransitionLook = { style: {}, fx: null };

/**
 * How an incoming scene draws over the outgoing one during its first `frames` frames, for the
 * transitions CSS draws alone. Hebrew reads right to left: a slide brings the next page in from
 * the left, as an RTL carousel does, and a wipe reveals the picture from right to left.
 */
export function enterStyle(
  type: WorkshopTransition,
  frame: number,
  frames: number,
): CSSProperties {
  // A skin switch draws itself (skinEnter): no fade or move of the whole scene.
  if (type === "cut" || type === "skin" || frames <= 0) return {};
  const p = inOutCubic(clamp01(frame / frames));
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
 * The look of a scene at `frame` of its picture (`total` frames, entering with `type` over its
 * first `enter` frames; the next scene enters with `exitType` over its last `exitFrames`).
 * `width` is the frame's, `id` the scene's filter id (workshop-transition-filter.tsx).
 */
export function transitionLook(scene: {
  type: WorkshopTransition;
  enter: number;
  exitType?: WorkshopTransition | null;
  exitFrames: number;
  frame: number;
  total: number;
  width: number;
  id: string;
}): TransitionLook {
  const { type, enter, frame, width, id } = scene;
  if (enter > 0 && frame < enter) {
    const look = fxEnter(type, frame, enter, width);
    return look
      ? withFilter(look, id)
      : { style: enterStyle(type, frame, enter), fx: null };
  }
  const from = scene.total - scene.exitFrames;
  if (scene.exitType && scene.exitFrames > 0 && frame >= from) {
    const look = fxExit(scene.exitType, frame - from, scene.exitFrames, width);
    return look ? withFilter(look, id) : REST;
  }
  return REST;
}

/** Points the style at the scene's filter while the filter does anything. */
function withFilter(
  look: { style: CSSProperties; fx: TransitionFx },
  id: string,
): TransitionLook {
  const { fx } = look;
  const active =
    fx.blur > 0.2 || fx.ripple > 0.2 || fx.split > 0.2 || fx.slice > 0.2;
  return active
    ? { style: { ...look.style, filter: `url(#${id})` }, fx }
    : { style: look.style, fx: null };
}
