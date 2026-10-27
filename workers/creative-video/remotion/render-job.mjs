import {
  copyFile,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
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
  [1, 2, 3].includes(manifest.schemaVersion) && manifest.fps === 30,
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
const endCardFrames =
  manifest.schemaVersion === 3 && manifest.endCard
    ? manifest.endCard.frameCount
    : 0;
assert(
  Number.isInteger(endCardFrames) && endCardFrames >= 0 && endCardFrames <= 300,
  "Invalid end card",
);
const totalFrames = cursor + endCardFrames;
assert(
  totalFrames === manifest.totalFrames && totalFrames <= 18000,
  "Invalid totalFrames",
);

const MOVES = ["push", "drift-left", "drift-right", "rise", "pull", "static"];
const TRANSITIONS = ["cut", "crossfade", "slide", "wipe", "zoom"];
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const FONT = /^[A-Za-z0-9][A-Za-z0-9 -]{0,39}$/;
const frameNo = (n) => Number.isInteger(n) && n >= 0 && n <= totalFrames;
const unit = (n, fallback) =>
  typeof n === "number" && n >= 0 && n <= 1 ? n : fallback;
const text = (value, max) => String(value ?? "").slice(0, max);

/** Volume keyframes: strictly increasing frames, volumes between 0 and 1. */
const envelopeOf = (env) => {
  if (!env) return null;
  const { frames, volumes } = env;
  assert(
    Array.isArray(frames) &&
      Array.isArray(volumes) &&
      frames.length >= 2 &&
      frames.length === volumes.length &&
      frames.length <= 4000 &&
      frames.every((f, i) => frameNo(f) && (i === 0 || f > frames[i - 1])) &&
      volumes.every((v) => unit(v, -1) >= 0),
    "Invalid music envelope",
  );
  return { frames, volumes };
};

/** Copies of the music track that cover the film: each inside it, fades within its length. */
const musicLoopsOf = (list) => {
  if (list === undefined || list === null) return null;
  assert(Array.isArray(list) && list.length <= 50, "Invalid music loops");
  return list.map((loop) => {
    assert(
      frameNo(loop?.startFrame) &&
        Number.isInteger(loop?.frameCount) &&
        loop.frameCount > 0 &&
        loop.startFrame + loop.frameCount <= totalFrames &&
        [loop.fadeInFrames, loop.fadeOutFrames].every(
          (n) => Number.isInteger(n) && n >= 0 && n <= loop.frameCount,
        ),
      "Invalid music loop",
    );
    return {
      startFrame: loop.startFrame,
      frameCount: loop.frameCount,
      fadeInFrames: loop.fadeInFrames,
      fadeOutFrames: loop.fadeOutFrames,
    };
  });
};

/** Karaoke lines: frame-timed words, at most 2000 lines of 12 words. */
const captionsOf = (list) => {
  if (!Array.isArray(list)) return [];
  assert(list.length <= 2000, "Too many captions");
  return list.map((line) => {
    assert(
      frameNo(line?.startFrame) &&
        frameNo(line?.endFrame) &&
        line.endFrame > line.startFrame &&
        Array.isArray(line.words) &&
        line.words.length > 0 &&
        line.words.length <= 12,
      "Invalid caption",
    );
    return {
      startFrame: line.startFrame,
      endFrame: line.endFrame,
      words: line.words.map((word) => {
        assert(
          frameNo(word?.startFrame) && frameNo(word?.endFrame),
          "Invalid caption word",
        );
        return {
          text: text(word.text, 40),
          startFrame: word.startFrame,
          endFrame: word.endFrame,
        };
      }),
    };
  });
};

const stageFile = async (root, publicDir, name) => {
  assert(
    typeof name === "string" && SAFE_NAME.test(name),
    "Invalid media name",
  );
  const source = await realpath(join(root, name));
  assert(
    source.startsWith(root + sep),
    "Media must stay in the manifest folder",
  );
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
  const v3 = manifest.schemaVersion === 3;
  for (const scene of sorted) {
    const still = scene.still || null;
    const clip = scene.clip || null;
    assert(still || clip, "Scene needs a still or a clip");
    assert(!(still && clip), "Scene has both a still and a clip");
    if (still) await stageFile(root, publicDir, still);
    if (clip) await stageFile(root, publicDir, clip);
    if (v3 && scene.voice) await stageFile(root, publicDir, scene.voice);
    assert(MOVES.includes(scene.move), "Invalid camera move");
    if (v3) {
      assert(
        !scene.transition || TRANSITIONS.includes(scene.transition),
        "Invalid transition",
      );
      assert(
        scene.transitionFrames === undefined ||
          (Number.isInteger(scene.transitionFrames) &&
            scene.transitionFrames >= 0 &&
            scene.transitionFrames <= scene.frameCount),
        "Invalid transition length",
      );
    }
  }
  let narration = null;
  let music = null;
  if (manifest.narration)
    narration = await stageFile(root, publicDir, manifest.narration);
  if (manifest.music) music = await stageFile(root, publicDir, manifest.music);
  // Sound design: short effects at set frames, each inside the film.
  const effects = [];
  if (v3 && manifest.effects !== undefined) {
    assert(
      Array.isArray(manifest.effects) && manifest.effects.length <= 200,
      "Invalid effects",
    );
    const staged = new Set();
    for (const cue of manifest.effects) {
      assert(
        frameNo(cue?.startFrame) &&
          Number.isInteger(cue?.frameCount) &&
          cue.frameCount > 0 &&
          cue.startFrame + cue.frameCount <= totalFrames,
        "Invalid effect timing",
      );
      if (!staged.has(cue.file)) {
        await stageFile(root, publicDir, cue.file);
        staged.add(cue.file);
      }
      effects.push({
        file: cue.file,
        startFrame: cue.startFrame,
        frameCount: cue.frameCount,
      });
    }
  }
  let brand = null;
  if (v3 && manifest.brand) {
    const b = manifest.brand;
    brand = {
      primaryColor: HEX.test(b.primaryColor ?? "") ? b.primaryColor : null,
      secondaryColor: HEX.test(b.secondaryColor ?? "")
        ? b.secondaryColor
        : null,
      logo: b.logo ? await stageFile(root, publicDir, b.logo) : null,
      fontFamily: FONT.test(b.fontFamily ?? "") ? b.fontFamily : null,
      ctaText: b.ctaText ? text(b.ctaText, 120) : null,
      // The call to action already wrapped into at most three lines.
      ctaLines:
        Array.isArray(b.ctaLines) && b.ctaLines.length
          ? b.ctaLines.slice(0, 3).map((line) => text(line, 120))
          : null,
      ctaUrl: b.ctaUrl ? text(b.ctaUrl, 120) : null,
    };
  }
  compositionId = "WorkshopFilm";
  props = {
    narration,
    music,
    musicLoops: v3 && music ? musicLoopsOf(manifest.musicLoops) : null,
    musicEnvelope: v3 ? envelopeOf(manifest.musicEnvelope) : null,
    effects,
    effectsEnvelope:
      v3 && effects.length ? envelopeOf(manifest.effectsEnvelope) : null,
    captions: v3 ? captionsOf(manifest.captions) : [],
    brand,
    endCardFrames,
    scenes: sorted.map((scene) => ({
      id: scene.id,
      durationFrames: scene.frameCount,
      still: scene.still || null,
      clip: scene.clip || null,
      caption: text(scene.caption, 180),
      move: scene.move,
      ...(v3
        ? {
            voice: scene.voice || null,
            // The scene's short title over karaoke captions (workshop-edit.mjs kickerTitle).
            kicker: scene.kicker ? text(scene.kicker, 40) : null,
            transition: scene.transition || "crossfade",
            transitionFrames: scene.transitionFrames ?? 0,
            lipsync: scene.lipsync === true,
            // A v3 manifest sets each clip's level; a missing one stays quiet under the mix.
            clipVolume: unit(scene.clipVolume, scene.lipsync ? 1 : 0.15),
            clipFrames:
              Number.isInteger(scene.clipFrames) && scene.clipFrames > 0
                ? scene.clipFrames
                : undefined,
          }
        : // A v2 manifest keeps its look: muted clips and short crossfades.
          { transition: "crossfade", transitionFrames: 8, clipVolume: 0 }),
    })),
  };
}

const entry = resolve("src/index.ts");
const bundleOptions = { entryPoint: entry };
if (manifest.schemaVersion >= 2) {
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
    durationInFrames: totalFrames,
    fps: 30,
  },
  serveUrl,
  codec: "h264",
  // Promo quality: near-transparent x264, broadly playable 4:2:0, clear AAC.
  crf: 18,
  x264Preset: "medium",
  pixelFormat: "yuv420p",
  audioCodec: "aac",
  audioBitrate: "192k",
  imageFormat: "jpeg",
  jpegQuality: 92,
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
      frames: totalFrames,
      fps: 30,
      width: manifest.width,
      height: manifest.height,
    },
    null,
    2,
  ),
);
console.log(output);
