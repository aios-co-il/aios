import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  MAX_OVERLAY_ELEMENTS,
  PIECES,
  overlayPieces,
} from "../../workers/creative-video/remotion/src/workshop-overlay-pieces.ts";
import {
  SCENE_OVERLAYS,
  companionColour,
  lightLeak,
  lowerThirdIn,
  rgba,
} from "../../workers/creative-video/remotion/src/workshop-overlays.ts";
import {
  SCENE_OVERLAYS as WORKER_OVERLAYS,
  sceneOverlayOf,
} from "../src/compose/scene-overlay.ts";
import { SCENE_OVERLAYS as CARMEN_OVERLAYS } from "../../supabase/functions/_shared/workshop/scene-overlays.ts";
import { buildTimeline } from "../src/compose/timeline.ts";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.ts";
import { loadFilmSettings, loadFilmSources } from "../src/jobs/render.ts";

const FRAMES = {
  "9:16": { width: 1080, height: 1920, fps: 25 },
  "1:1": { width: 1080, height: 1080, fps: 25 },
  "16:9": { width: 1920, height: 1080, fps: 25 },
};
const PIECED = ["bubbles", "particles", "confetti"];
const inside = (piece, { width, height }) =>
  piece.x >= -piece.size &&
  piece.x <= width + piece.size &&
  piece.y >= -piece.size &&
  piece.y <= height + piece.size;

/** The graphics over a scene's picture (workers/creative-video/remotion workshop-overlays.ts). */
describe("scene overlays", () => {
  test("Carmen, the worker and the film know the same overlays", () => {
    expect(WORKER_OVERLAYS).toEqual([...SCENE_OVERLAYS]);
    expect([...CARMEN_OVERLAYS]).toEqual([...SCENE_OVERLAYS]);
  });

  test("render-job passes every overlay but none to the film", () => {
    const job = readFileSync(
      new URL(
        "../../workers/creative-video/remotion/render-job.mjs",
        import.meta.url,
      ),
      "utf8",
    );
    const list = job.match(/const OVERLAYS = \[([^\]]*)\]/)?.[1] ?? "";
    expect(list.match(/"[^"]+"/g)).toEqual(
      SCENE_OVERLAYS.filter((o) => o !== "none").map((o) => `"${o}"`),
    );
  });

  test("a scene draws the same pieces at the same frame in every render", () => {
    for (const overlay of PIECED) {
      const a = overlayPieces(overlay, "scene-1", 1.4, FRAMES["9:16"]);
      const b = overlayPieces(overlay, "scene-1", 1.4, FRAMES["9:16"]);
      const other = overlayPieces(overlay, "scene-2", 1.4, FRAMES["9:16"]);
      expect(a).toEqual(b);
      expect(a).not.toEqual(other);
    }
  });

  test("each overlay draws a fixed, small number of pieces", () => {
    for (const overlay of PIECED) {
      expect(PIECES[overlay]).toBeLessThanOrEqual(MAX_OVERLAY_ELEMENTS);
      for (const t of [0, 0.5, 2, 9]) {
        expect(overlayPieces(overlay, "s", t, FRAMES["1:1"])).toHaveLength(
          PIECES[overlay],
        );
      }
    }
    for (const overlay of ["none", "light-leak", "lower-third"]) {
      expect(overlayPieces(overlay, "s", 1, FRAMES["1:1"])).toEqual([]);
    }
  });

  test("bubbles and particles stay in the frame of every shape, all scene long", () => {
    for (const frame of Object.values(FRAMES)) {
      for (const overlay of ["bubbles", "particles"]) {
        for (let t = 0; t < 12; t += 0.37) {
          for (const piece of overlayPieces(overlay, "s-7", t, frame)) {
            expect(inside(piece, frame)).toBe(true);
            expect(piece.opacity).toBeGreaterThanOrEqual(0);
            expect(piece.opacity).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  test("bubbles rise and fade out near the top", () => {
    const frame = FRAMES["9:16"];
    const before = overlayPieces("bubbles", "s", 1, frame);
    const after = overlayPieces("bubbles", "s", 1.04, frame);
    const rose = after.filter((piece, i) => piece.y < before[i].y);
    // All rise, but for one that just wrapped from the top back to the bottom.
    expect(rose.length).toBeGreaterThanOrEqual(after.length - 1);
    const nearTop = [];
    for (let t = 0; t < 8; t += 0.2) {
      nearTop.push(
        ...overlayPieces("bubbles", "s", t, frame).filter(
          (p) => p.y < frame.height * 0.05,
        ),
      );
    }
    expect(nearTop.length).toBeGreaterThan(0);
    for (const piece of nearTop) expect(piece.opacity).toBeLessThan(0.2);
  });

  test("confetti bursts at the scene's start, fills the frame, then falls out of it", () => {
    for (const frame of Object.values(FRAMES)) {
      expect(overlayPieces("confetti", "s", -0.1, frame)).toEqual([]);
      const flying = overlayPieces("confetti", "s", 0.8, frame);
      const shown = flying.filter((piece) => inside(piece, frame));
      expect(shown.length).toBeGreaterThan(flying.length * 0.8);
      expect(Math.min(...flying.map((p) => p.y))).toBeLessThan(
        frame.height * 0.3,
      );
      const gone = overlayPieces("confetti", "s", 6, frame);
      expect(gone.every((piece) => piece.y > frame.height)).toBe(true);
      expect(new Set(flying.map((p) => p.tone))).toEqual(new Set([0, 1, 2]));
    }
  });

  test("the light leak sweeps across and swells mid-scene", () => {
    const start = lightLeak(0, "s");
    const middle = lightLeak(0.5, "s");
    const end = lightLeak(1, "s");
    expect(middle.opacity).toBeGreaterThan(start.opacity);
    expect(middle.opacity).toBeGreaterThan(end.opacity);
    expect(end.glows[0].x).not.toBe(start.glows[0].x);
    expect(lightLeak(0.3, "s")).toEqual(lightLeak(0.3, "s"));
  });

  test("the lower third slides in after the scene starts and out before it ends", () => {
    expect(lowerThirdIn(0, 100)).toBe(0);
    expect(lowerThirdIn(20, 100)).toBe(1);
    expect(lowerThirdIn(60, 100)).toBe(1);
    expect(lowerThirdIn(100, 100)).toBe(0);
    expect(lowerThirdIn(8, 100)).toBeGreaterThan(0);
    expect(lowerThirdIn(8, 100)).toBeLessThan(1);
  });

  test("the confetti's colours come from the brand's accent", () => {
    expect(rgba("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
    expect(companionColour("#ff0000")).toBe("hsl(150, 90%, 62%)");
    expect(companionColour("teal")).toBe("#ffd23f");
  });
});

describe("a scene's overlay through the render worker", () => {
  const scene = (id, extra = {}) => ({
    id,
    position: Number(id.replace(/\D/g, "")) || 1,
    clipPath: `${id}.mp4`,
    durationS: 2,
    ...extra,
  });

  test("only known overlays are read", () => {
    expect(sceneOverlayOf("confetti")).toBe("confetti");
    expect(sceneOverlayOf("none")).toBe("none");
    expect(sceneOverlayOf("fireworks")).toBeNull();
    expect(sceneOverlayOf(undefined)).toBeNull();
  });

  test("the film's overlay and each scene's are read from the database", async () => {
    const settings = await loadFilmSettings(
      {
        select: async () => [
          { payload: { video: { scene_overlay: "bubbles" } } },
        ],
      },
      { item_id: "i1", tenant_id: "t1" },
    );
    expect(settings.sceneOverlay).toBe("bubbles");
    const sources = await loadFilmSources(
      {
        async select(table) {
          if (table === "marketing_video_scenes") {
            return [
              {
                id: "s1",
                position: 1,
                clip_asset_id: "c1",
                meta: { scene_overlay: "confetti" },
              },
              {
                id: "s2",
                position: 2,
                clip_asset_id: "c2",
                meta: { scene_overlay: "glitter" },
              },
            ];
          }
          return table === "marketing_assets"
            ? [
                { id: "c1", url: "t/c1.mp4", meta: {} },
                { id: "c2", url: "t/c2.mp4", meta: {} },
              ]
            : [];
        },
      },
      { item_id: "i1", tenant_id: "t1" },
    );
    expect(sources.scenes.map((s) => s.sceneOverlay)).toEqual([
      "confetti",
      null,
    ]);
  });

  test("a scene's own overlay wins over the film's, and its none turns it off", () => {
    const timeline = buildTimeline(
      [
        scene("s1", { sceneOverlay: "confetti" }),
        scene("s2"),
        scene("s3", { sceneOverlay: "none" }),
      ],
      { sceneOverlay: "light-leak" },
    );
    expect(timeline.sceneOverlay).toBe("light-leak");
    const { manifest } = buildWorkshopManifest(timeline);
    expect(manifest.scenes.map((s) => s.overlay)).toEqual([
      "confetti",
      "light-leak",
      undefined,
    ]);
    const plain = buildWorkshopManifest(buildTimeline([scene("s1")]));
    expect(plain.manifest.scenes[0].overlay).toBeUndefined();
  });
});
