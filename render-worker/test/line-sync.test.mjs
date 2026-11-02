import { expect, test } from "vitest";
import { lineFrames } from "../src/compose/line-sync.mjs";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.mjs";

const framed = (starts) =>
  starts.map((startFrame, index) => ({
    text: `w${index}`,
    startFrame,
    endFrame: startFrame + 8,
  }));

test("each scene of a continuous take starts when its own line starts", () => {
  // Lines of 2, 1 and 3 words; the take lasts 200 frames with its tail.
  const words = framed([0, 10, 75, 120, 130, 140]);
  expect(
    lineFrames(["א ב", "ג", "ד ה ו"], words, [75, 75, 75], 200),
  ).toStrictEqual([75, 45, 80]);
  // The last scene keeps its own length when that is longer.
  expect(
    lineFrames(["א ב", "ג", "ד ה ו"], words, [75, 75, 120], 200),
  ).toStrictEqual([75, 45, 120]);
});

test("a scene with no line or words that do not add up fall back to even stretching", () => {
  const words = framed([0, 10, 75]);
  expect(lineFrames(["א ב", ""], words, [75, 75], 100)).toBe(null);
  expect(lineFrames(["א", "ב"], words, [75, 75], 100)).toBe(null);
});

test("the manifest cuts a narrated film at its line boundaries", () => {
  const chars = (text, start, step) =>
    [...text].map((character, index) => ({
      character,
      start: start + index * step,
      end: start + (index + 1) * step,
    }));
  const one = chars("קפה טוב", 0, 0.3);
  const two = chars(" מאפה", one.at(-1).end, 0.3);
  const all = [...one, ...two];
  const { manifest } = buildWorkshopManifest({
    narrationPath: "/tmp/n.mp3",
    narrationAlignment: {
      characters: all.map((c) => c.character),
      character_start_times_seconds: all.map((c) => c.start),
      character_end_times_seconds: all.map((c) => c.end),
    },
    scenes: [
      {
        id: "a",
        clipPath: "/tmp/a.mp4",
        clipProvider: "kling",
        durationS: 5,
        narrationText: "קפה טוב",
      },
      {
        id: "b",
        clipPath: "/tmp/b.mp4",
        clipProvider: "kling",
        durationS: 5,
        narrationText: "מאפה",
      },
    ],
  });
  const [a, b] = manifest.scenes;
  // "מאפה" starts at 2.4 s (8 characters × 0.3 s): scene b starts there.
  expect(b.startFrame).toBe(Math.round(2.4 * manifest.fps));
  expect(a.frameCount).toBe(b.startFrame);
});
