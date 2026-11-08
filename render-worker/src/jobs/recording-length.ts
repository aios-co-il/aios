/**
 * How long a user's recording really is (guide-take.ts), measured by decoding it: a browser's
 * WebM often states no duration, and a file uploaded outside the board's recorder may state any.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../ffmpeg.ts";

/**
 * Seconds of audio in `bytes`, decoding at most `capSeconds` plus two (a longer file reads as
 * longer than the cap without decoding all of it), or null when ffmpeg decodes no audio from it.
 * Throws ffmpeg's error for a file it cannot read.
 */
export async function recordingSeconds(
  bytes: Uint8Array,
  capSeconds: number,
): Promise<number | null> {
  const dir = await mkdtemp(join(tmpdir(), "guide-"));
  try {
    const file = join(dir, "recording");
    await writeFile(file, bytes);
    const { stderr } = await run("ffmpeg", [
      "-hide_banner",
      "-nostdin",
      "-i",
      file,
      "-vn",
      "-t",
      String(capSeconds + 2),
      "-f",
      "null",
      "-",
    ]);
    return lastProgressSeconds(stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The last "time=HH:MM:SS.ss" of ffmpeg's progress lines, in seconds, or null without one. */
export function lastProgressSeconds(stderr: string): number | null {
  const times = [...stderr.matchAll(/time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g)];
  const last = times.at(-1);
  if (!last) {
    return null;
  }
  const seconds =
    Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
  return seconds > 0 ? Math.round(seconds * 100) / 100 : null;
}
