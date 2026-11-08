// Loudness of the film's sound files (EBU R128) and levelling them, with ffmpeg.
import { run } from "./ffmpeg.ts";

const LEVEL = /-?(?:\d+(?:\.\d+)?|inf)/.source;
const level = (value: string | undefined) =>
  value === undefined
    ? null
    : value.endsWith("inf")
      ? -Infinity
      : Number(value);

/**
 * Reads ffmpeg's ebur128 log: the integrated loudness (LUFS), the true peak (dBTP), the
 * loudest momentary (400 ms) reading, and the last moment the sound stays within 10 LU of its
 * integrated level: where a music track's body ends, before its outro dies away.
 */
export function parseLoudness(stderr: unknown) {
  const text = String(stderr ?? "");
  const summary = text.slice(text.lastIndexOf("Summary:"));
  const integrated = level(
    new RegExp(`Integrated loudness:\\s*I:\\s*(${LEVEL})`).exec(summary)?.[1],
  );
  const truePeak = level(
    new RegExp(`True peak:\\s*Peak:\\s*(${LEVEL})`).exec(summary)?.[1],
  );
  const frame = new RegExp(`t:\\s*([0-9.]+)\\s.*?\\sM:\\s*(${LEVEL})`);
  const loud: Array<[number, number]> = [];
  for (const line of text.split("\n")) {
    const match = frame.exec(line);
    if (!match) {
      continue;
    }
    const momentary = level(match[2]);
    if (momentary !== null && Number.isFinite(momentary) && momentary > -70) {
      loud.push([Number(match[1]), momentary]);
    }
  }
  const heard =
    integrated !== null && Number.isFinite(integrated) && integrated > -70;
  const body = heard
    ? loud.filter(([, momentary]) => momentary >= integrated - 10).at(-1)
    : null;
  return {
    integrated: heard ? integrated : null,
    truePeak: truePeak !== null && Number.isFinite(truePeak) ? truePeak : null,
    maxMomentary: loud.length ? Math.max(...loud.map(([, m]) => m)) : null,
    bodyEndS: body ? body[0] : null,
  };
}

/** Loudness of a sound file (EBU R128, see parseLoudness). */
export async function measureLoudness(file: string) {
  const { stderr } = await run("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i",
    file,
    "-vn",
    "-af",
    "ebur128=peak=true:framelog=info",
    "-f",
    "null",
    "-",
  ]);
  return parseLoudness(stderr);
}

/**
 * Writes `file` at `gainDb` as 48 kHz stereo WAV. With `limit`, a lookahead limiter (delay
 * compensated) holds the peaks under -1 dBFS.
 */
export const normalizeAudio = (
  file: string,
  out: string,
  { gainDb = 0, limit = false } = {},
) =>
  run("ffmpeg", [
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
      `volume=${Number(gainDb).toFixed(2)}dB`,
      ...(limit ? ["alimiter=limit=0.891:level=0:latency=1"] : []),
    ].join(","),
    "-c:a",
    "pcm_s16le",
    out,
  ]);
