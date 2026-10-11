import { spawn } from "node:child_process";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const FORMATS = { "9:16": [1080, 1920], "4:5": [1080, 1350], "1:1": [1080, 1080], "16:9": [1920, 1080] };

function exec(command, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let errors = "";
    process.stderr.on("data", chunk => { errors = (errors + chunk.toString()).slice(-3000); });
    process.on("error", reject);
    process.on("close", code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${errors}`)));
  });
}

/**
 * Isolated Node worker, NOT an Edge Function. An authorized asset staging layer
 * must resolve remote asset IDs into local files before invoking this renderer.
 * Never accept arbitrary network URLs directly from the browser.
 */
export async function renderVideo(manifest, outputPath, options = {}) {
  if (manifest?.schemaVersion !== 1 || !FORMATS[manifest.format] || manifest.fps !== 30 ||
      !Array.isArray(manifest.scenes) || !manifest.scenes.length) throw Error("Invalid manifest");
  const [width, height] = [options.width ?? FORMATS[manifest.format][0], options.height ?? FORMATS[manifest.format][1]];
  if (width % 2 || height % 2 || width < 64 || height < 64) throw Error("Invalid dimensions");
  let cursor = 0;
  for (const scene of manifest.scenes) {
    if (!Number.isInteger(scene.frameCount) || scene.frameCount < 1 ||
        scene.startFrame !== cursor || !scene.imageUrl) throw Error("Invalid timeline");
    cursor += scene.frameCount;
  }
  if (cursor !== manifest.totalFrames || cursor > 18000) throw Error("Invalid total frames");
  const temp = await mkdtemp(path.join(tmpdir(), "carmen-video-"));
  try {
    const clips = [];
    for (let index = 0; index < manifest.scenes.length; index++) {
      const scene = manifest.scenes[index];
      if (!scene.imageUrl.startsWith("file://")) throw Error("Media must be staged by an authorized asset service");
      const image = path.join(temp, `scene-${index}.png`);
      const clip = path.join(temp, `clip-${index}.mp4`);
      await copyFile(new URL(scene.imageUrl), image);
      await exec("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-loop", "1",
        "-framerate", "30", "-i", image,
        "-vf", `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,format=yuv420p`,
        "-frames:v", String(scene.frameCount), "-an", "-c:v", "libx264", "-preset", "ultrafast",
        "-crf", "23", "-movflags", "+faststart", clip]);
      clips.push(clip);
    }
    const playlist = path.join(temp, "concat.txt");
    await writeFile(playlist, clips.map(clip => `file '${clip.replaceAll("'", "'\\''")}'`).join("\n"));
    await exec("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat",
      "-safe", "0", "-i", playlist, "-c", "copy", "-movflags", "+faststart", outputPath]);
    return { outputPath, width, height, frames: cursor, durationSeconds: cursor / 30 };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
