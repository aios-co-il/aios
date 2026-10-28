import { spawnSync } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { assembleFilm } from "../src/compose/assemble.mjs";
import { buildTimeline } from "../src/compose/timeline.mjs";
import { probe } from "../src/ffmpeg.mjs";

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
  expect(timeline.narrationPath).toBe(null);
  expect(timeline.fps).toBe(25);
  const narrated = buildTimeline(
    [
      {
        id: "a",
        position: 1,
        clipPath: "a.mp4",
        voicePath: "scene.mp3",
        durationS: 2,
      },
    ],
    { narrationPath: "narration.mp3" },
  );
  expect(narrated.narrationPath).toBe("narration.mp3");
  expect(narrated.scenes[0].voicePath).toBe(null);
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
  60_000,
);

test.skipIf(!hasFfmpeg)(
  "assembleFilm plays one narration across the whole picture",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "narration-"));
    try {
      const clip = join(dir, "clip.mp4");
      const voice = join(dir, "voice.wav");
      const output = join(dir, "film.mp4");
      media([
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=320x240:d=1",
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
        voice,
      ]);
      await assembleFilm(
        buildTimeline(
          [{ id: "a", position: 1, clipPath: clip, durationS: 0.8 }],
          { narrationPath: voice },
        ),
        output,
      );
      const detected = spawnSync(
        "ffmpeg",
        ["-i", output, "-af", "volumedetect", "-f", "null", "-"],
        { encoding: "utf8" },
      );
      const mean = Number(
        detected.stderr.match(/mean_volume:\s*(-?[0-9.]+) dB/)?.[1],
      );
      expect(mean > -45, detected.stderr.slice(-400)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);

test.skipIf(!hasFfmpeg)(
  "assembleFilm stretches a scene to its voice and the film to the narration",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "lengths-"));
    const quiet = ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi"];
    try {
      const clip = join(dir, "clip.mp4");
      const voice = join(dir, "voice.wav");
      const narration = join(dir, "narration.wav");
      media([
        ...quiet,
        ...["-i", "color=c=green:s=320x240:d=1", "-c:v", "libx264"],
        ...["-pix_fmt", "yuv420p", clip],
      ]);
      media([...quiet, "-i", "sine=frequency=440:duration=2", voice]);
      media([...quiet, "-i", "sine=frequency=330:duration=3", narration]);

      const voiced = join(dir, "voiced.mp4");
      await assembleFilm(
        buildTimeline(
          [
            {
              id: "a",
              position: 1,
              clipPath: clip,
              durationS: 1,
              voicePath: voice,
            },
          ],
          { aspect: "1:1" },
        ),
        voiced,
      );
      expect((await probe(voiced)).duration).toBeGreaterThanOrEqual(2.4);

      const narrated = join(dir, "narrated.mp4");
      await assembleFilm(
        buildTimeline(
          [
            { id: "a", position: 1, clipPath: clip, durationS: 0.8 },
            { id: "b", position: 2, clipPath: clip, durationS: 0.8 },
          ],
          { aspect: "1:1", narrationPath: narration },
        ),
        narrated,
      );
      expect((await probe(narrated)).duration).toBeGreaterThanOrEqual(3.4);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);

test("a talking clip carries its move and its line's word timings; another scene does not", () => {
  const alignment = { words: [{ text: "אני", start: 0, end: 0.3 }] };
  const { scenes } = buildTimeline([
    {
      id: "talk",
      position: 1,
      clipPath: "t1/talk.mp4",
      lipsync: true,
      spokenText: "אני",
      spokenAlignment: alignment,
      moveClipPath: "t1/move.mp4",
    },
    {
      id: "quiet",
      position: 2,
      clipPath: "t1/quiet.mp4",
      spokenAlignment: alignment,
      moveClipPath: "t1/move.mp4",
    },
  ]);
  expect(scenes[0].spokenAlignment).toStrictEqual(alignment);
  expect(scenes[0].moveClipPath).toBe("t1/move.mp4");
  expect(scenes[1].spokenAlignment).toBe(null);
  expect(scenes[1].moveClipPath).toBe(null);
});
