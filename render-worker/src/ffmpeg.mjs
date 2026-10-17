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
