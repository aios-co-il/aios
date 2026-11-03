import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  END_CARD_BACKGROUNDS,
  blobsAt,
  brandPair,
  endCardBackgroundOf,
  lastSceneLook,
  patternDrift,
  raysAt,
} from "../../workers/creative-video/remotion/src/workshop-end-card-backdrop.ts";
import {
  MAX_PARTICLES,
  particlesAt,
} from "../../workers/creative-video/remotion/src/workshop-end-card-particles.ts";
import {
  glassEntrance,
  glassFit,
  glassStyle,
} from "../../workers/creative-video/remotion/src/workshop-end-card-glass.ts";
import { END_CARD_BACKGROUNDS as WORKER_BACKGROUNDS } from "../src/compose/film-look.mjs";
import { END_CARD_BACKGROUNDS as CARMEN_BACKGROUNDS } from "../../supabase/functions/_shared/workshop/film-look.ts";

const JOB = readFileSync(
  new URL(
    "../../workers/creative-video/remotion/render-job.mjs",
    import.meta.url,
  ),
  "utf8",
);

/** Frames across a long end card, to check each background's motion over all of them. */
const FRAMES = [0, 1, 7, 30, 59, 90, 149, 240, 299];

const inFrame = (value) => value >= 0 && value <= 1;

/** What plays behind the closing card and its glass panel (Remotion, pure numbers per frame). */
describe("end-card backgrounds and glass", () => {
  test("Carmen, the worker, the render job and the film know the same backgrounds", () => {
    expect([...END_CARD_BACKGROUNDS]).toEqual(WORKER_BACKGROUNDS);
    expect([...CARMEN_BACKGROUNDS]).toEqual(WORKER_BACKGROUNDS);
    for (const name of END_CARD_BACKGROUNDS) expect(JOB).toContain(`"${name}"`);
    expect(JOB).toContain("endCardGlass: manifest.endCardGlass === true");
  });

  test("a film without a known background keeps its last scene behind the card", () => {
    expect(endCardBackgroundOf(null)).toBe("last-scene");
    expect(endCardBackgroundOf(undefined)).toBe("last-scene");
    expect(endCardBackgroundOf("neon")).toBe("last-scene");
    expect(endCardBackgroundOf("particles")).toBe("particles");
    expect(endCardBackgroundOf("plain")).toBe("plain");
  });

  test("the brand's second colour is used, else one derived from the accent", () => {
    const [accent, second] = brandPair("#0b5cad", "#e0b84a");
    expect(accent).toContain("#0b5cad");
    expect(second).toContain("#e0b84a");
    const [, derived] = brandPair("#0b5cad", null);
    expect(derived).toContain("#0b5cad");
    expect(derived).not.toBe(accent);
  });

  test("the last scene goes out of focus and dark, then pushes in slowly", () => {
    expect(lastSceneLook(0)).toStrictEqual({ blur: 0, scale: 1.06, dim: 0 });
    expect(lastSceneLook(20).blur).toBeCloseTo(24);
    expect(lastSceneLook(60).blur).toBeCloseTo(24);
    expect(lastSceneLook(60).dim).toBeGreaterThan(0.4);
    expect(lastSceneLook(90).scale).toBeGreaterThan(lastSceneLook(30).scale);
    expect(lastSceneLook(900).scale).toBeLessThanOrEqual(1.2);
  });

  test("the gradient's blobs drift slowly and stay in the frame", () => {
    for (const frame of FRAMES) {
      const blobs = blobsAt(frame);
      expect(blobs).toHaveLength(4);
      for (const blob of blobs) {
        expect(inFrame(blob.x) && inFrame(blob.y)).toBe(true);
        expect([0, 1]).toContain(blob.colour);
      }
      expect(blobsAt(frame)).toStrictEqual(blobs);
    }
    // Slow: a blob moves well under a hundredth of the frame from one frame to the next.
    const [a, b] = [blobsAt(30)[0], blobsAt(31)[0]];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.01);
  });

  test("the pattern drifts within one tile, so it loops without a seam", () => {
    for (const frame of FRAMES) {
      const drift = patternDrift(frame, 80);
      expect(drift.x >= 0 && drift.x < 80 && drift.y >= 0 && drift.y < 80).toBe(
        true,
      );
      expect(patternDrift(frame, 80)).toStrictEqual(drift);
    }
    expect(patternDrift(30, 80).x).not.toBe(patternDrift(0, 80).x);
  });

  test("the particles are seeded, at most sixty, and stay in the frame", () => {
    expect(particlesAt(0, 500)).toHaveLength(MAX_PARTICLES);
    expect(MAX_PARTICLES).toBeLessThanOrEqual(60);
    for (const frame of FRAMES) {
      const lights = particlesAt(frame);
      expect(lights).toHaveLength(44);
      expect(particlesAt(frame)).toStrictEqual(lights);
      for (const p of lights) {
        expect(inFrame(p.x) && inFrame(p.y)).toBe(true);
        expect(p.opacity >= 0 && p.opacity <= 1).toBe(true);
        expect(p.r).toBeLessThan(0.08);
      }
    }
    // Another seed, another sky; the lights rise over time.
    expect(particlesAt(0, 44, 8)).not.toStrictEqual(particlesAt(0, 44, 7));
    expect(particlesAt(10)[0].y).not.toBe(particlesAt(0)[0].y);
  });

  test("the light rays sweep a few degrees from the top and never vanish", () => {
    for (const frame of FRAMES) {
      const rays = raysAt(frame);
      expect(rays).toHaveLength(5);
      expect(raysAt(frame)).toStrictEqual(rays);
      for (const ray of rays) {
        expect(Math.abs(ray.angle)).toBeLessThanOrEqual(40);
        expect(inFrame(ray.x)).toBe(true);
        expect(ray.opacity).toBeGreaterThan(0.2);
        expect(ray.opacity).toBeLessThan(0.6);
      }
    }
    expect(raysAt(45)[0].angle).not.toBe(raysAt(0)[0].angle);
  });

  test("the glass panel enters gently and is frosted glass at rest", () => {
    expect(glassEntrance(0)).toStrictEqual({
      opacity: 0,
      scale: 0.94,
      lift: 0.02,
    });
    expect(glassEntrance(10).opacity).toBeGreaterThan(0.5);
    expect(glassEntrance(30)).toStrictEqual({ opacity: 1, scale: 1, lift: 0 });
    const style = glassStyle(720);
    expect(style.backdropFilter).toBe("blur(18px) saturate(140%)");
    expect(style.background).toContain("rgba(255,255,255,0.16)");
    expect(style.border).toMatch(/^1px solid/);
    expect(glassStyle(720, "#0b5cad").background).toContain("#0b5cad");
    // The text on the panel gets less room than without it; on a wide frame, less still.
    expect(glassFit(720, 1280, false)).toBe(1);
    expect(glassFit(720, 1280, true)).toBeLessThan(1);
    expect(glassFit(1280, 720, true)).toBeLessThan(glassFit(720, 1280, true));
  });
});
