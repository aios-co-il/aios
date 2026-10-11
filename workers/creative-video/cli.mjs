import { readFile } from "node:fs/promises";
import { renderVideo } from "./render.mjs";

const [manifestPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !outputPath) {
  console.error("Usage: node workers/creative-video/cli.mjs <manifest.json> <output.mp4>");
  process.exit(2);
}
try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const result = await renderVideo(manifest, outputPath);
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
