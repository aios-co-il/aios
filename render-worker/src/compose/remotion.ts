import { spawn } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { probe } from "../ffmpeg.ts";
import type { ProbeResult } from "../ffmpeg.ts";
import { measured } from "./remotion-measure.ts";
import type { Timeline } from "./types.ts";
import { prepareSound } from "./sound-prep.ts";
import { buildWorkshopManifest } from "./workshop-manifest.ts";

const remotionDir = () =>
  process.env.REMOTION_DIR ||
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../workers/creative-video/remotion",
  );

/** A render still running after this long is stopped (REMOTION_TIMEOUT_MS overrides it). */
const RENDER_TIMEOUT_MS = () =>
  Number(process.env.REMOTION_TIMEOUT_MS) || 20 * 60_000;

/**
 * Runs the render job in its own process group, so a stop also ends the browser Remotion
 * starts: after timeoutMs, or when the worker itself exits.
 */
const run = (
  command: string,
  args: Array<string>,
  cwd: string,
  timeoutMs: number,
) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "inherit", "pipe"],
      detached: true,
    });
    const stop = () => {
      try {
        // No pid: the process never started, so there is no group to stop.
        if (child.pid === undefined) {
          throw new Error("not started");
        }
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    process.on("exit", stop);
    const settle = (error: Error | null) => {
      clearTimeout(timer);
      process.off("exit", stop);
      if (error) reject(error);
      else resolve();
    };
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    child.on("error", settle);
    child.on("exit", () => {
      if (timedOut)
        settle(
          new Error(
            `remotion render timed out after ${Math.round(timeoutMs / 1000)} s`,
          ),
        );
    });
    child.on("close", (code) => {
      if (timedOut) return;
      settle(
        code === 0
          ? null
          : new Error(`remotion ${code}: ${stderr.slice(-800)}`),
      );
    });
  });

/**
 * Renders the film with the WorkshopFilm composition. Media stays on local disk.
 * Returns the film length, which grows past the storyboard when the narration is longer.
 */
export async function assembleWithRemotion(
  timeline: Timeline,
  outputPath: string,
  workDir: string,
  {
    probeFile = probe,
    prepare = prepareSound,
    timeoutMs = RENDER_TIMEOUT_MS(),
  }: {
    probeFile?: (
      file: string,
    ) => Promise<Pick<ProbeResult, "duration" | "hasAudio">>;
    prepare?: (timeline: Timeline, dir: string) => Promise<Timeline>;
    timeoutMs?: number;
  } = {},
) {
  const stage = join(workDir, "remotion");
  await mkdir(stage, { recursive: true });
  // Music and effects levelled first (sound-prep.ts), then measured for the edit.
  const levelled = await prepare(timeline, join(workDir, "sound"));
  const plan = buildWorkshopManifest(await measured(levelled, probeFile));
  for (const file of plan.files)
    await copyFile(file.from, join(stage, file.to));
  const manifestPath = join(stage, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(plan.manifest));
  await run(
    process.execPath,
    [join(remotionDir(), "render-job.mjs"), manifestPath, outputPath],
    remotionDir(),
    timeoutMs,
  );
  return {
    outputPath,
    durationS:
      Math.round((plan.manifest.totalFrames / plan.manifest.fps) * 100) / 100,
  };
}
