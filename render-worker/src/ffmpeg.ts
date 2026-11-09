import { spawn } from "node:child_process";
import { parseShowinfoTimes } from "./shots.ts";

/** Runs `command` with `args`; resolves its output, rejects with the end of its stderr. */
export const run = (command: string, args: Array<string>) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
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

/** Length, picture size and whether the file has sound, read with ffprobe. */
export async function probe(file: string): Promise<ProbeResult> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const data: FfprobeOutput = JSON.parse(stdout);
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  return {
    duration: Number(data.format?.duration ?? video?.duration ?? 0),
    width: video?.width ?? null,
    height: video?.height ?? null,
    hasAudio: !!data.streams?.some((stream) => stream.codec_type === "audio"),
  };
}

/** Scene-change times (seconds). `threshold` is ffmpeg's scene score, 0–1. */
export async function detectCuts(file: string, threshold = 0.3) {
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

export const extractFrame = (file: string, seconds: number, out: string) =>
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

export const extractAudio = (file: string, out: string) =>
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

/** What probe reads from a media file; width and height are null without a picture. */
export interface ProbeResult {
  duration: number;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
}

/** The ffprobe JSON fields probe reads. */
interface FfprobeOutput {
  format?: { duration?: string };
  streams?: Array<{
    codec_type?: string;
    duration?: string;
    width?: number;
    height?: number;
  }>;
}
