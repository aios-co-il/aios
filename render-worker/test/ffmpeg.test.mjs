import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { detectCuts, extractFrame, probe } from "../src/ffmpeg.mjs";
import { buildShots } from "../src/shots.mjs";

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test.skipIf(!hasFfmpeg)(
  "a synthetic 3-shot video is split at its hard cuts",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "ffmpeg-test-"));
    try {
      const file = join(dir, "three.mp4");
      // Three visually distinct test patterns (2s, 3s, 2s) with a tone track.
      execFileSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=s=320x180:d=2:r=25",
        "-f",
        "lavfi",
        "-i",
        "smptebars=s=320x180:d=3:r=25",
        "-f",
        "lavfi",
        "-i",
        "mandelbrot=s=320x180:r=25,trim=duration=2",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=7",
        "-filter_complex",
        "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
        "-map",
        "[v]",
        "-map",
        "3:a",
        "-shortest",
        "-pix_fmt",
        "yuv420p",
        file,
      ]);
      const info = await probe(file);
      expect(Math.abs(info.duration - 7) < 0.2).toBeTruthy();
      expect(info.hasAudio).toBe(true);
      const shots = buildShots(await detectCuts(file), info.duration);
      expect(shots.map((shot) => Math.round(shot.start))).toStrictEqual([
        0, 2, 5,
      ]);
      await extractFrame(file, 3.5, join(dir, "frame.jpg"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
