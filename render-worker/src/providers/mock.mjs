import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Free stand-in for a video model: a slow Ken Burns push-in on the still, rendered with
// ffmpeg. Lets Staging exercise the whole animate → clip → render path without spending.
const SIZES = {
  "16:9": [1280, 720],
  "9:16": [720, 1280],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};

const ffmpeg = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg ${code}: ${stderr.slice(-500)}`)),
    );
  });

export async function kenBurnsClip(
  imageBytes,
  { durationS = 5, aspect = "16:9", fps = 25 } = {},
) {
  const [width, height] = SIZES[aspect] ?? SIZES["16:9"];
  const frames = Math.round(Math.max(1, durationS) * fps);
  const dir = await mkdtemp(join(tmpdir(), "mock-clip-"));
  try {
    const input = join(dir, "still");
    const output = join(dir, "clip.mp4");
    await writeFile(input, imageBytes);
    await ffmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-loop",
      "1",
      "-i",
      input,
      "-vf",
      `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},zoompan=z='min(zoom+0.0008,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${fps}`,
      "-frames:v",
      String(frames),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-an",
      output,
    ]);
    return new Uint8Array(await readFile(output));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function mockProvider() {
  const jobs = new Map();
  return {
    name: "mock",
    model: "ken-burns",
    estimate: () => ({ credits: 0, usd: 0 }),
    async submit({ imageBytes, durationS, aspect }) {
      if (!imageBytes) throw new Error("mock provider needs imageBytes");
      const jobId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      jobs.set(jobId, kenBurnsClip(imageBytes, { durationS, aspect }));
      return { jobId };
    },
    async poll(jobId) {
      const job = jobs.get(jobId);
      if (!job) return { status: "failed", error: "unknown mock job" };
      try {
        const bytes = await job;
        jobs.delete(jobId);
        return { status: "succeeded", bytes };
      } catch (error) {
        jobs.delete(jobId);
        return {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
