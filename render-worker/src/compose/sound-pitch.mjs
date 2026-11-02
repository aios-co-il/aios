/**
 * A transition sound at another pitch, for a later round of a film's set (transition-sounds.mjs
 * ROUND_PITCH; sound-prep.mjs makes it at render time).
 */
import { run } from "../ffmpeg.mjs";

/**
 * Writes `file` `semitones` higher (or lower, negative) as 48 kHz stereo WAV, its length kept:
 * resampled to the new pitch, then stretched back to its own length.
 */
export const pitchAudio = (file, out, semitones) => {
  const ratio = 2 ** (Number(semitones) / 12);
  return run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    file,
    "-vn",
    "-af",
    [
      "aformat=sample_rates=48000:channel_layouts=stereo",
      `asetrate=${Math.round(48000 * ratio)}`,
      "aresample=48000",
      `atempo=${(1 / ratio).toFixed(5)}`,
    ].join(","),
    "-c:a",
    "pcm_s16le",
    out,
  ]);
};
