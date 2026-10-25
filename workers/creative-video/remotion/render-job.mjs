import { copyFile, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";

const [manifestPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !outputPath) {
  console.error("Usage: node render-job.mjs manifest.json output.mp4");
  process.exit(2);
}

const assert = (ok, msg) => {
  if (!ok) throw Error(msg);
};
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*$/i;

const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
assert(
  (manifest.schemaVersion === 1 || manifest.schemaVersion === 2) &&
    manifest.fps === 30,
  "Invalid manifest",
);
assert(
  Number.isInteger(manifest.width) &&
    manifest.width >= 240 &&
    manifest.width <= 3840 &&
    Number.isInteger(manifest.height) &&
    manifest.height >= 240 &&
    manifest.height <= 3840,
  "Invalid dimensions",
);
assert(
  Array.isArray(manifest.scenes) &&
    manifest.scenes.length > 0 &&
    manifest.scenes.length <= 100,
  "Invalid scene count",
);
const sorted = [...manifest.scenes].sort((a, b) => a.order - b.order);
let cursor = 0;
const ids = new Set();
for (const scene of sorted) {
  assert(
    typeof scene.id === "string" && scene.id && !ids.has(scene.id),
    "Invalid scene id",
  );
  ids.add(scene.id);
  assert(
    Number.isInteger(scene.frameCount) &&
      scene.frameCount > 0 &&
      scene.startFrame === cursor,
    "Invalid frame timing",
  );
  cursor += scene.frameCount;
}
assert(
  cursor === manifest.totalFrames && cursor <= 18000,
  "Invalid totalFrames",
);

const stageFile = async (root, publicDir, name) => {
  assert(typeof name === "string" && SAFE_NAME.test(name), "Invalid media name");
  const source = await realpath(join(root, name));
  assert(source.startsWith(root + sep), "Media must stay in the manifest folder");
  const target = join(publicDir, name);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  return name;
};

let props;
let compositionId;
if (manifest.schemaVersion === 1) {
  compositionId = "CarmenVideo";
  props = {
    title: "CARMEN MARKETING OS",
    scenes: sorted.map((scene, index) => ({
      id: scene.id,
      durationFrames: scene.frameCount,
      kind: ["sink", "chaos", "arrival", "lift", "surface", "cta"][
        Math.min(index, 5)
      ],
      caption: String(scene.overlayText || scene.title || "").slice(0, 500),
    })),
  };
} else {
  assert(manifest.composition === "WorkshopFilm", "Invalid composition");
  const root = await realpath(dirname(resolve(manifestPath)));
  const publicDir = join(root, "public");
  await mkdir(join(publicDir, "fonts"), { recursive: true });
  const fontSource = resolve("public/fonts/Heebo-Bold.ttf");
  await copyFile(fontSource, join(publicDir, "fonts/Heebo-Bold.ttf"));
  const names = new Set();
  for (const scene of sorted) {
    const still = scene.still || null;
    const clip = scene.clip || null;
    assert(still || clip, "Scene needs a still or a clip");
    assert(!(still && clip), "Scene has both a still and a clip");
    if (still) names.add(await stageFile(root, publicDir, still));
    if (clip) names.add(await stageFile(root, publicDir, clip));
    assert(
      ["push", "drift-left", "drift-right", "rise", "pull"].includes(scene.move),
      "Invalid camera move",
    );
  }
  let narration = null;
  let music = null;
  if (manifest.narration)
    narration = await stageFile(root, publicDir, manifest.narration);
  if (manifest.music) music = await stageFile(root, publicDir, manifest.music);
  compositionId = "WorkshopFilm";
  props = {
    narration,
    music,
    scenes: sorted.map((scene) => ({
      id: scene.id,
      durationFrames: scene.frameCount,
      still: scene.still || null,
      clip: scene.clip || null,
      caption: String(scene.caption || "").slice(0, 180),
      move: scene.move,
    })),
  };
  void names;
}

const entry = resolve("src/index.ts");
const bundleOptions = { entryPoint: entry };
if (manifest.schemaVersion === 2) {
  bundleOptions.publicDir = join(
    await realpath(dirname(resolve(manifestPath))),
    "public",
  );
}
const serveUrl = await bundle(bundleOptions);
const compositions = await getCompositions(serveUrl, { inputProps: props });
const composition = compositions.find((item) => item.id === compositionId);
assert(composition, "Missing composition");
const output = resolve(outputPath);
await mkdir(dirname(output), { recursive: true });
await renderMedia({
  composition: {
    ...composition,
    width: manifest.width,
    height: manifest.height,
    durationInFrames: cursor,
    fps: 30,
  },
  serveUrl,
  codec: "h264",
  outputLocation: output,
  inputProps: props,
  concurrency: 2,
});
await writeFile(
  output + ".json",
  JSON.stringify(
    {
      status: "completed",
      composition: compositionId,
      frames: cursor,
      fps: 30,
      width: manifest.width,
      height: manifest.height,
    },
    null,
    2,
  ),
);
console.log(output);
