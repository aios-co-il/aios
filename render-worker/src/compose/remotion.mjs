import { spawn } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWorkshopManifest } from "./workshop-manifest.mjs";

const remotionDir = () =>
  process.env.REMOTION_DIR ||
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../workers/creative-video/remotion",
  );

const run = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "inherit", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`remotion ${code}: ${stderr.slice(-800)}`)),
    );
  });

/** Renders the film with the WorkshopFilm composition. Media stays on local disk. */
export async function assembleWithRemotion(timeline, outputPath, workDir) {
  const plan = buildWorkshopManifest(timeline);
  const stage = join(workDir, "remotion");
  await mkdir(stage, { recursive: true });
  for (const file of plan.files) await copyFile(file.from, join(stage, file.to));
  const manifestPath = join(stage, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(plan.manifest));
  await run(
    process.execPath,
    [join(remotionDir(), "render-job.mjs"), manifestPath, outputPath],
    remotionDir(),
  );
  return outputPath;
}
