import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { assembleFilm } from "../src/compose/assemble.mjs";
import { buildTimeline } from "../src/compose/timeline.mjs";
import { hasFfmpeg, media } from "./media.mjs";

/** Where sound starts in `file` (seconds), after at least 0.1 s of silence. */
const onsets = (file) => {
  const out = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      file,
      "-af",
      "silencedetect=n=-50dB:d=0.1",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  return [...out.stderr.matchAll(/silence_end: ([0-9.]+)/g)].map((m) =>
    Number(m[1]),
  );
};

/** When the picture cuts (seconds): frames that differ from the one before. */
const cuts = (file) => {
  const out = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      file,
      "-an",
      "-vf",
      "select='gt(scene,0.3)',showinfo",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  return [...out.stderr.matchAll(/pts_time:([0-9.]+)/g)].map((m) =>
    Number(m[1]),
  );
};

test.skipIf(!hasFfmpeg)(
  "the ffmpeg edit's sounds stay on their cuts through a long film",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "sfx-sync-"));
    try {
      const tone = join(dir, "tone.wav");
      media([
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=900:duration=0.2",
        "-af",
        "volume=2",
        tone,
      ]);
      // Ten scenes of 1.5 s: each segment's own audio is a little longer than its slot (AAC
      // framing), which must not push the film's sounds off its pictures.
      const scenes = Array.from({ length: 10 }, (_, index) => {
        const clip = join(dir, `c${index}.mp4`);
        media([
          "-f",
          "lavfi",
          "-i",
          `color=c=${index % 2 ? "red" : "blue"}:s=320x240:d=2`,
          "-pix_fmt",
          "yuv420p",
          clip,
        ]);
        return {
          id: `s${index}`,
          position: index,
          clipPath: clip,
          durationS: 1.5,
        };
      });
      const output = join(dir, "film.mp4");
      await assembleFilm(
        buildTimeline(scenes, { effects: { transitionPaths: [tone] } }),
        output,
      );
      // The pictures cut every 1.5 s, and each cut's sound starts 0.4 s before its cut.
      const pictureCuts = cuts(output);
      expect(pictureCuts.length).toBe(scenes.length - 1);
      for (const [index, at] of pictureCuts.entries())
        expect(Math.abs(at - 1.5 * (index + 1))).toBeLessThan(0.05);
      // (The last silence ends with the film.)
      const heard = onsets(output).slice(0, -1);
      expect(heard.length).toBe(pictureCuts.length);
      for (const [index, at] of pictureCuts.entries())
        expect(Math.abs(heard[index] - (at - 0.4))).toBeLessThan(0.05);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);
