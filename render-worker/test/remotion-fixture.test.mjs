import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.mjs";

/**
 * The Remotion smoke workflow (.github/workflows/creative-remotion-smoke.yml) renders this
 * manifest with render-job.mjs: a two-scene trailer whose 2 s music track is looped across the
 * film, with kickers over karaoke captions and an end card. It must stay what the worker
 * builds; after a deliberate manifest change, rerun with UPDATE_FIXTURE=1 to rewrite it.
 */
const FIXTURE = new URL(
  "../../workers/creative-video/remotion/fixtures/workshop-manifest.json",
  import.meta.url,
);

const spoken = (text, from, to) => {
  const chars = [...text];
  const step = (to - from) / chars.length;
  const at = (i) => +(from + i * step).toFixed(3);
  return {
    characters: chars,
    character_start_times_seconds: chars.map((_, i) => at(i)),
    character_end_times_seconds: chars.map((_, i) => at(i + 1)),
  };
};

const LINES = ["היא קוראת את הנתונים", "ומקדמת אותך בגוגל"];
const scene = (id, still, title, line) => ({
  id,
  clipPath: `/x/${id}.mp4`,
  stillPath: `/x/${still}`,
  clipProvider: "mock",
  durationS: 2,
  overlayText: title,
  voiceoverText: line,
  narrationText: line,
});

test("the smoke workflow's Workshop fixture is what the worker builds", () => {
  const { manifest } = buildWorkshopManifest({
    aspect: "16:9",
    narrationPath: "/x/narration.wav",
    narrationDurationS: 3.5,
    narrationAlignment: spoken(LINES.join(" "), 0.1, 3.4),
    musicPath: "/x/music.wav",
    musicDurationS: 2,
    musicBodyS: 1.8,
    soundDesign: true,
    voiceLufs: -19,
    brand: { ctaText: "הירשמו עכשיו", primaryColor: "#0ea5e9" },
    scenes: [
      scene("analyst", "still-a.png", "אנליסטית", LINES[0]),
      scene("seo", "still-b.png", "SEO ו-GEO", LINES[1]),
    ],
  });
  // A small frame keeps the CI render quick.
  const built = { ...manifest, width: 640, height: 360 };
  if (process.env.UPDATE_FIXTURE)
    writeFileSync(FIXTURE, `${JSON.stringify(built, null, 2)}\n`);
  expect(JSON.parse(readFileSync(FIXTURE, "utf8"))).toStrictEqual(built);
  // What the workflow checks for: copies of the track to the film's end, and the kickers.
  expect(built.musicLoops.length).toBeGreaterThan(1);
  expect(
    built.musicLoops.at(-1).startFrame + built.musicLoops.at(-1).frameCount,
  ).toBe(built.totalFrames);
  expect(built.scenes.map((s) => s.kicker)).toStrictEqual([
    "אנליסטית",
    "SEO ו-GEO",
  ]);
});
