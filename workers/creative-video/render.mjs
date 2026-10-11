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
    const intermediate = path.join(temp, "joined.mp4");
    await exec("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat",
      "-safe", "0", "-i", playlist, "-c", "copy", intermediate]);
    const escapeAss = (value) => String(value || "").replace(/[{}\\\\]/g, "").replace(/\\r?\\n/g, "\\\\N");
    const assTime = (frames) => {
      const cs = Math.round(frames * 100 / 30);
      return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
    };
    const ass = path.join(temp, "captions.ass");
    const header = `[Script Info]\\nScriptType: v4.00+\\nPlayResX: ${width}\\nPlayResY: ${height}\\nWrapStyle: 0\\n[V4+ Styles]\\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\\nStyle: Caption,Noto Sans Hebrew,${Math.max(20, Math.round(width * 0.047))},&H00FFFFFF,&H00000000,&H0010150A,&H80000000,1,0,0,0,100,100,0,0,1,3,1,2,80,80,${Math.round(height * 0.12)},1\\n[Events]\\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\\n`;
    const subtitles = manifest.scenes.filter(s => s.overlayText).map(s =>
      `Dialogue: 0,${assTime(s.startFrame)},${assTime(s.startFrame + s.frameCount)},Caption,,0,0,0,,${escapeAss(s.overlayText)}`).join("\\n");
    await writeFile(ass, header + subtitles + "\\n");
    const audio = options.audioPath ? ["-i", options.audioPath] : [];
    await exec("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", intermediate,
      ...audio, ...(subtitles ? ["-vf", `ass=${ass}`] : []),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
      ...(audio.length ? ["-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-b:a", "160k", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-shortest"] : ["-an"]),
      "-movflags", "+faststart", outputPath]);
    return { outputPath, width, height, frames: cursor, durationSeconds: cursor / 30 };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
