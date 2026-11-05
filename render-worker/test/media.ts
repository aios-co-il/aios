/** ffmpeg helpers for the sound tests: synthetic media and a stretch's mean level. */
import { spawnSync } from "node:child_process";

export const hasFfmpeg =
  spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

/** Runs ffmpeg with `args` (quiet, overwriting), throwing on failure. */
export const media = (args) => {
  const result = spawnSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...args,
  ]);
  if (result.status !== 0) throw new Error(String(result.stderr));
};

/** Mean volume (dB) of `file` over [from, from + length] seconds; -91 when silent. */
export const meanDb = (file, from, length) => {
  const out = spawnSync(
    "ffmpeg",
    [
      "-ss",
      String(from),
      "-t",
      String(length),
      "-i",
      file,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  return Number(out.stderr.match(/mean_volume:\s*(-?[0-9.]+) dB/)?.[1] ?? -91);
};

/** A gain as dB. */
export const db = (gain) => 20 * Math.log10(gain);
