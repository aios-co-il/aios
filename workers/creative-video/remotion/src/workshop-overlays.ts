/**
 * The animated graphics drawn over a Workshop scene's picture, under its text
 * (workshop-overlay.tsx draws them). Pure numbers per frame, seeded by the scene's id, so a
 * scene looks the same in every render and every frame is tested without rendering. The
 * overlays made of many pieces are in workshop-overlay-pieces.ts.
 */

import { channels } from "./workshop-layout";
import { clamp01, random, seedOf, wrap } from "./workshop-overlay-pieces";

/** The overlays, in the order Carmen's tools list them (render-worker scene-overlay.mjs). */
export const SCENE_OVERLAYS = [
  "none",
  "bubbles",
  "particles",
  "confetti",
  "light-leak",
  "lower-third",
] as const;

export type SceneOverlay = (typeof SCENE_OVERLAYS)[number];

export const isSceneOverlay = (value: unknown): value is SceneOverlay =>
  typeof value === "string" &&
  (SCENE_OVERLAYS as readonly string[]).includes(value);

/** The light leak at share `p` (0–1) of the scene: two glows sweeping across, centres in %. */
export function lightLeak(p: number, sceneId: string) {
  const rand = random(seedOf(`light-leak:${sceneId}`));
  const fromLeft = rand() < 0.5;
  const along = (start: number) => (fromLeft ? start : 100 - start);
  const swell = Math.sin(Math.PI * clamp01(p));
  return {
    glows: [
      { x: along(-20 + 130 * p), y: 18 + 30 * rand() + 20 * p, radius: 75 },
      { x: along(110 - 90 * p), y: 70 + 15 * rand() - 25 * p, radius: 55 },
    ],
    opacity: 0.35 + 0.55 * swell,
  };
}

/** How far the lower third's bar is in (0–1), `t` frames into the scene of `frames` frames. */
export function lowerThirdIn(t: number, frames: number): number {
  const ease = (x: number) => 1 - (1 - clamp01(x)) ** 3;
  return Math.min(ease((t - 2) / 12), ease((frames - t) / 8));
}

/** The accent at an alpha, as rgba; a white wash for anything that is not a hex colour. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = (channels(hex) ?? [1, 1, 1]).map((c) =>
    Math.round(c * 255),
  );
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** A second confetti colour beside the brand's: its hue turned 150 degrees, bright. */
export function companionColour(hex: string): string {
  const rgb = channels(hex);
  if (!rgb) return "#ffd23f";
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const hue =
    d === 0
      ? 0
      : max === r
        ? ((g - b) / d) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
  return `hsl(${Math.round(wrap(hue * 60 + 150, 360))}, 90%, 62%)`;
}
