import { spawnSync } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { assembleFilm } from "../src/compose/assemble.mjs";
import { buildTimeline } from "../src/compose/timeline.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

test("buildTimeline keeps approved clips in storyboard order", () => {
  const timeline = buildTimeline(
    [
      {
        id: "b",
        position: 2,
        clipPath: "b.mp4",
        durationS: 2,
        overlayText: "  שלום  ",
      },
      { id: "skip", position: 0, durationS: 9 },
      {
        id: "a",
        position: 1,
        clipPath: "a.mp4",
        voicePath: "a.mp3",
        durationS: 0.1,
      },
    ],
    { aspect: "16:9", musicPath: "bed.mp3" },
  );
  expect(timeline.scenes.map((scene) => scene.id)).toStrictEqual(["a", "b"]);
  expect(timeline.scenes[0].durationS).toBe(0.5);
  expect(timeline.scenes[0].voicePath).toBe("a.mp3");
  expect(timeline.scenes[1].overlayText).toBe("שלום");
  expect(timeline.totalS).toBe(2.5);
  expect([timeline.width, timeline.height]).toStrictEqual([1280, 720]);
  expect(timeline.musicPath).toBe("bed.mp3");
  expect(timeline.fps).toBe(25);
});

const media = (args) => {
  const result = spawnSync("ffmpeg", args, { stdio: "ignore" });
  if (result.status !== 0)
    throw new Error(`ffmpeg fixture failed: ${args.join(" ")}`);
};

test.skipIf(!hasFfmpeg)(
  "assembleFilm writes an mp4 from the shared timeline",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "timeline-"));
    try {
      const clip = join(dir, "clip.mp4");
      const music = join(dir, "music.wav");
      const output = join(dir, "film.mp4");
      media([
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=320x240:d=1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        clip,
      ]);
      media([
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1",
        music,
      ]);
      const timeline = buildTimeline(
        [
          {
            id: "a",
            position: 1,
            clipPath: clip,
            durationS: 0.6,
            overlayText: "כותרת",
          },
        ],
        { aspect: "9:16", musicPath: music },
      );
      await assembleFilm(timeline, output);
      const file = await stat(output);
      expect(file.size > 1000).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
