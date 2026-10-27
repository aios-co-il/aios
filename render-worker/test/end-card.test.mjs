import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { assembleFilm } from "../src/compose/assemble.mjs";
import { brandFromPayload } from "../src/compose/brand.mjs";
import {
  END_CARD_S,
  ctaFontPx,
  ctaLines,
  hasEndCard,
} from "../src/compose/end-card.mjs";
import { buildTimeline } from "../src/compose/timeline.mjs";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.mjs";
import { probe } from "../src/ffmpeg.mjs";

const WAITLIST =
  "הירשמו לרשימת ההמתנה — 1000 הנרשמים הראשונים יקבלו את חבילת הבסיס בחינם לכל החיים!";

test("a whole-sentence call to action wraps into three even lines, in reading order", () => {
  const lines = ctaLines(WAITLIST);
  expect(lines.length).toBe(3);
  expect(lines.join(" ")).toBe(WAITLIST);
  const lengths = lines.map((line) => line.length);
  expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(12);
  expect(lines[0].startsWith("הירשמו")).toBe(true);
  expect(lines[2].endsWith("החיים!")).toBe(true);
  // Readable on a 9:16 film: large enough, and the longest line fits the frame.
  const px = ctaFontPx(lines, { width: 1080, height: 1920 });
  expect(px).toBeGreaterThanOrEqual(48);
  expect(Math.max(...lengths) * px * 0.56).toBeLessThanOrEqual(1080 * 0.8);
  const wide = ctaFontPx(lines, { width: 1920, height: 1080 });
  expect(wide).toBeGreaterThanOrEqual(px);

  expect(ctaLines("מחכים לכם בגפן")).toStrictEqual(["מחכים לכם בגפן"]);
  expect(ctaLines("הזמינו עכשיו ותקבלו משלוח חינם עד הבית").length).toBe(2);
  expect(ctaLines("   ")).toStrictEqual([]);
  expect(ctaLines("x ".repeat(200)).join(" ").length).toBeLessThanOrEqual(120);
});

test("the brand keeps the whole sentence and the Remotion card gets its lines", () => {
  const brand = brandFromPayload({ cta_text: WAITLIST });
  expect(brand.ctaText).toBe(WAITLIST);
  const { manifest } = buildWorkshopManifest({
    aspect: "9:16",
    brand,
    scenes: [
      {
        id: "a",
        clipPath: "/tmp/a.mp4",
        stillPath: "/tmp/a.png",
        clipProvider: "mock",
        durationS: 2,
      },
    ],
  });
  expect(manifest.brand.ctaText).toBe(WAITLIST);
  expect(manifest.brand.ctaLines).toStrictEqual(ctaLines(WAITLIST));
  expect(manifest.endCard).toStrictEqual({ startFrame: 60, frameCount: 75 });
  expect(hasEndCard({ ctaText: WAITLIST })).toBe(true);
  expect(hasEndCard({ ctaText: WAITLIST, endCard: false })).toBe(false);
  expect(hasEndCard({ primaryColor: "#123456" })).toBe(false);
});

const hasFfmpeg =
  spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

test.skipIf(!hasFfmpeg)(
  "the ffmpeg edit closes on an end card with the long call to action",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "end-card-"));
    try {
      const clip = join(dir, "clip.mp4");
      const made = spawnSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=gray:s=320x240:d=1",
        "-pix_fmt",
        "yuv420p",
        clip,
      ]);
      expect(made.status).toBe(0);
      const output = join(dir, "film.mp4");
      await assembleFilm(
        buildTimeline(
          [{ id: "a", position: 1, clipPath: clip, durationS: 1 }],
          {
            aspect: "9:16",
            brand: {
              ctaText: WAITLIST,
              ctaUrl: "aios.co.il",
              primaryColor: "#08F467",
            },
          },
        ),
        output,
      );
      const info = await probe(output);
      expect(Math.abs(info.duration - (1 + END_CARD_S))).toBeLessThan(0.15);
      // The card is drawn: its frame is far from the flat background colour.
      const frame = join(dir, "card.png");
      const grab = spawnSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(1 + END_CARD_S - 0.5),
        "-i",
        output,
        "-frames:v",
        "1",
        "-vf",
        "signalstats,metadata=print:file=-",
        "-f",
        "null",
        "-",
      ]);
      const stats = String(grab.stdout);
      const max = Number(stats.match(/signalstats\.YMAX=(\d+)/)?.[1] ?? 0);
      expect(max).toBeGreaterThan(150);
      if (process.env.END_CARD_SAMPLE)
        spawnSync("ffmpeg", [
          "-y",
          "-ss",
          String(1 + END_CARD_S - 0.5),
          "-i",
          output,
          "-frames:v",
          "1",
          process.env.END_CARD_SAMPLE,
        ]);
      expect(frame).toBeTruthy();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);
