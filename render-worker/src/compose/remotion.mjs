import { spawn } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { probe } from "../ffmpeg.mjs";
import { prepareSound } from "./sound-prep.mjs";
import { buildWorkshopManifest } from "./workshop-manifest.mjs";

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
const run = (command, args, cwd, timeoutMs) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "inherit", "pipe"],
      detached: true,
    });
    const stop = () => {
      try {
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
    const settle = (error) => {
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

/** Media lengths and audio tracks the edit needs; an unreadable file keeps the defaults. */
async function measured(timeline, probeFile) {
  const read = async (file) => {
    try {
      return await probeFile(file);
    } catch {
      return null;
    }
  };
  const scenes = [];
  for (const scene of timeline.scenes) {
    const clip = scene.clipPath ? await read(scene.clipPath) : null;
    const voice = scene.voicePath ? await read(scene.voicePath) : null;
    const move = scene.moveClipPath ? await read(scene.moveClipPath) : null;
    scenes.push({
      ...scene,
      clipHasAudio: clip ? clip.hasAudio : scene.clipHasAudio,
      clipDurationS: clip?.duration || scene.clipDurationS || 0,
      voiceDurationS: voice?.duration || scene.voiceDurationS || 0,
      ...(scene.moveClipPath
        ? {
            moveClipDurationS: move?.duration || scene.moveClipDurationS || 0,
          }
        : {}),
    });
  }
  const narration = timeline.narrationPath
    ? await read(timeline.narrationPath)
    : null;
  const music = timeline.musicPath ? await read(timeline.musicPath) : null;
  let effects = null;
  if (timeline.effects) {
    // Each cut's sound with its length (a file two cuts share is read once).
    const lengths = new Map();
    const cuts = [];
    for (const cut of timeline.effects.cuts ?? []) {
      if (!lengths.has(cut.path))
        lengths.set(cut.path, (await read(cut.path))?.duration || 0);
      cuts.push({ ...cut, durationS: lengths.get(cut.path) });
    }
    effects = {
      ...timeline.effects,
      cuts,
      impactDurationS: timeline.effects.impactPath
        ? (await read(timeline.effects.impactPath))?.duration || 0
        : 0,
    };
  }
  return {
    ...timeline,
    scenes,
    effects,
    narrationDurationS: narration?.duration || timeline.narrationDurationS || 0,
    // The bed's length, so a track shorter than the film is looped (musicLoops).
    musicDurationS: music?.duration || timeline.musicDurationS || 0,
  };
}

/**
 * Renders the film with the WorkshopFilm composition. Media stays on local disk.
 * Returns the film length, which grows past the storyboard when the narration is longer.
 */
export async function assembleWithRemotion(
  timeline,
  outputPath,
  workDir,
  {
    probeFile = probe,
    prepare = prepareSound,
    timeoutMs = RENDER_TIMEOUT_MS(),
  } = {},
) {
  const stage = join(workDir, "remotion");
  await mkdir(stage, { recursive: true });
  // Music and effects levelled first (sound-prep.mjs), then measured for the edit.
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
