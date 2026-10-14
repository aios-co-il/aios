import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
        : reject(new Error(`ffmpeg ${code}: ${stderr.slice(-600)}`)),
    );
  });

/** One scene: the clip, fitted to the frame, with the voiceover (or silence) for its duration. */
async function segment(timeline, scene, index, dir) {
  const output = join(dir, `seg-${index}.mp4`);
  const duration = scene.durationS.toFixed(3);
  const fitted = join(dir, `fit-${index}.mp4`);
  await ffmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    scene.clipPath,
    "-t",
    duration,
    "-vf",
    `scale=${timeline.width}:${timeline.height}:force_original_aspect_ratio=increase,crop=${timeline.width}:${timeline.height}`,
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(timeline.fps),
    fitted,
  ]);
  const audioArgs = scene.voicePath
    ? ["-i", scene.voicePath]
    : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];
  await ffmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    fitted,
    ...audioArgs,
    "-filter_complex",
    `[1:a]apad,atrim=0:${duration},asetpts=PTS-STARTPTS[a]`,
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-t",
    duration,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    output,
  ]);
  return output;
}

/** Concatenates the segments and lays the music bed under the voice. */
export async function assembleFilm(timeline, outputPath) {
  if (!timeline.scenes.length) throw new Error("render: no approved clips");
  const dir = join(outputPath, "..", "segments");
  await mkdir(dir, { recursive: true });
  const segments = [];
  for (const [index, scene] of timeline.scenes.entries()) {
    segments.push(await segment(timeline, scene, index, dir));
  }
  const list = join(dir, "list.txt");
  await writeFile(
    list,
    segments
      .map((file) => `file '${file.replaceAll("'", "'\\''")}'`)
      .join("\n"),
  );
  const picture = join(dir, "picture.mp4");
  await ffmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-c",
    "copy",
    picture,
  ]);
  if (!timeline.musicPath) {
    await ffmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      picture,
      "-c",
      "copy",
      outputPath,
    ]);
    return outputPath;
  }
  await ffmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    picture,
    "-i",
    timeline.musicPath,
    "-filter_complex",
    "[1:a]volume=0.18[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]",
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    outputPath,
  ]);
  return outputPath;
}
