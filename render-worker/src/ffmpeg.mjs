import { spawn } from "node:child_process";
import { parseShowinfoTimes } from "./shots.mjs";

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve({ stdout, stderr })
        : reject(new Error(`${command} exited ${code}: ${stderr.slice(-800)}`)),
    );
  });

export async function probe(file) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const data = JSON.parse(stdout);
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  return {
    duration: Number(data.format?.duration ?? video?.duration ?? 0),
    width: video?.width ?? null,
    height: video?.height ?? null,
    hasAudio: !!data.streams?.some((stream) => stream.codec_type === "audio"),
  };
}

/** Scene-change times (seconds). `threshold` is ffmpeg's scene score, 0–1. */
export async function detectCuts(file, threshold = 0.3) {
  const { stderr } = await run("ffmpeg", [
    "-hide_banner",
    "-i",
    file,
    "-an",
    "-vf",
    `select='gt(scene,${threshold})',showinfo`,
    "-f",
    "null",
    "-",
  ]);
  return parseShowinfoTimes(stderr);
}

export const extractFrame = (file, seconds, out) =>
  run("ffmpeg", [
    "-hide_banner",
    "-y",
    "-ss",
    String(seconds),
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    "scale=640:-2",
    "-q:v",
    "4",
    out,
  ]);

export const extractAudio = (file, out) =>
  run("ffmpeg", [
    "-hide_banner",
    "-y",
    "-i",
    file,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "64k",
    out,
  ]);

const LEVEL = /-?(?:\d+(?:\.\d+)?|inf)/.source;
const level = (value) =>
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
export function parseLoudness(stderr) {
  const text = String(stderr ?? "");
  const summary = text.slice(text.lastIndexOf("Summary:"));
  const integrated = level(
    new RegExp(`Integrated loudness:\\s*I:\\s*(${LEVEL})`).exec(summary)?.[1],
  );
  const truePeak = level(
    new RegExp(`True peak:\\s*Peak:\\s*(${LEVEL})`).exec(summary)?.[1],
  );
  const frame = new RegExp(`t:\\s*([0-9.]+)\\s.*?\\sM:\\s*(${LEVEL})`);
  const loud = [];
  for (const line of text.split("\n")) {
    const match = frame.exec(line);
    const momentary = match ? level(match[2]) : null;
    if (Number.isFinite(momentary) && momentary > -70)
      loud.push([Number(match[1]), momentary]);
  }
  const heard = Number.isFinite(integrated) && integrated > -70;
  const body = heard
    ? loud.filter(([, momentary]) => momentary >= integrated - 10).at(-1)
    : null;
  return {
    integrated: heard ? integrated : null,
    truePeak: Number.isFinite(truePeak) ? truePeak : null,
    maxMomentary: loud.length ? Math.max(...loud.map(([, m]) => m)) : null,
    bodyEndS: body ? body[0] : null,
  };
}

/** Loudness of a sound file (EBU R128, see parseLoudness). */
export async function measureLoudness(file) {
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
export const normalizeAudio = (file, out, { gainDb = 0, limit = false } = {}) =>
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
