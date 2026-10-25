/** The edit Remotion renders. A mock clip is a still with a zoom, so the
 * composition animates the still. A real video clip is placed on the timeline as-is. */
import { brandColor, brandFont } from "./brand.mjs";
import {
  captionChunks,
  spreadWords,
  wordsFromAlignment,
  wordsToFrames,
} from "./captions.mjs";
import {
  MIX,
  fitScenes,
  musicEnvelope,
  sceneTransition,
  speaks,
  speechSpans,
  transitionFrames,
} from "./workshop-edit.mjs";

export const WORKSHOP_FPS = 30;
export const WORKSHOP_SCHEMA = 3;
export const END_CARD_FRAMES = 75;
const TAIL_FRAMES = 15;
export const WORKSHOP_MOVES = [
  "push",
  "drift-left",
  "rise",
  "drift-right",
  "pull",
];

const FRAME = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};

const SAFE_EXT = new Set(
  "png jpg jpeg webp svg mp4 webm mov wav mp3 m4a".split(" "),
);

export const workshopFrameSize = (aspect) => FRAME[aspect] ?? FRAME["9:16"];

const extension = (path) => {
  const match = /\.([a-z0-9]{1,5})$/i.exec(String(path).split(/[?#]/, 1)[0]);
  const ext = (match?.[1] || "").toLowerCase();
  return SAFE_EXT.has(ext) ? ext : "bin";
};

const seconds = (value) => (Number(value) > 0 ? Number(value) : 0);
const lastEnd = (words) => words.reduce((n, w) => Math.max(n, w.end), 0);

function brandOf(brand, files) {
  if (!brand) return null;
  let logo = null;
  if (brand.logoPath) {
    logo = `logo.${extension(brand.logoPath)}`;
    files.push({ from: brand.logoPath, to: logo });
  }
  const out = {
    primaryColor: brandColor(brand.primaryColor),
    secondaryColor: brandColor(brand.secondaryColor),
    logo,
    fontFamily: brandFont(brand.fontFamily),
    ctaText:
      String(brand.ctaText ?? "")
        .trim()
        .slice(0, 60) || null,
    ctaUrl:
      String(brand.ctaUrl ?? "")
        .trim()
        .slice(0, 120) || null,
  };
  return Object.values(out).some(Boolean) ? out : null;
}

/**
 * @returns {{ manifest: object, files: { from: string, to: string }[] }}
 */
export function buildWorkshopManifest(timeline) {
  const fps = WORKSHOP_FPS;
  const [width, height] = workshopFrameSize(timeline.aspect);
  const files = [];
  const picked = [];
  for (const [index, scene] of timeline.scenes.entries()) {
    const provider = scene.clipProvider || "mock";
    const useStill = provider === "mock" && scene.stillPath && !scene.lipsync;
    const source = useStill ? scene.stillPath : scene.clipPath;
    if (!source) continue;
    const name = `${useStill ? "still" : "clip"}-${index}.${extension(source)}`;
    files.push({ from: source, to: name });
    let voice = null;
    if (scene.voicePath) {
      voice = `voice-${index}.${extension(scene.voicePath)}`;
      files.push({ from: scene.voicePath, to: voice });
    }
    const voiceWords = voice ? wordsFromAlignment(scene.voiceAlignment) : [];
    const voiceS = Math.max(seconds(scene.voiceDurationS), lastEnd(voiceWords));
    const clipFrames =
      !useStill && seconds(scene.clipDurationS)
        ? Math.floor(seconds(scene.clipDurationS) * fps)
        : null;
    // Speech is never cut: a scene lasts as long as its voice or its lip-synced clip.
    const frames = Math.max(
      15,
      Math.round(seconds(scene.durationS) * fps),
      voiceS ? Math.ceil(voiceS * fps) + TAIL_FRAMES : 0,
      scene.lipsync && clipFrames ? clipFrames : 0,
    );
    picked.push({
      index,
      scene,
      name,
      useStill,
      voice,
      voiceWords,
      voiceS,
      clipFrames,
      frames,
    });
  }
  if (!picked.length) throw new Error("render: no pictures for remotion");

  let narration = null;
  let narrationWords = [];
  let narrationFrames = 0;
  if (timeline.narrationPath) {
    narration = `narration.${extension(timeline.narrationPath)}`;
    files.push({ from: timeline.narrationPath, to: narration });
    narrationWords = wordsFromAlignment(timeline.narrationAlignment);
    const narrationS = Math.max(
      seconds(timeline.narrationDurationS),
      lastEnd(narrationWords),
    );
    if (narrationS) narrationFrames = Math.ceil(narrationS * fps) + TAIL_FRAMES;
  }
  const counts = fitScenes(
    picked.map((p) => p.frames),
    narrationFrames,
  );

  let cursor = 0;
  let framed = wordsToFrames(narrationWords, fps);
  const spans = [];
  if (narration && !narrationWords.length && narrationFrames)
    spans.push([0, narrationFrames - TAIL_FRAMES]);
  const scenes = picked.map((p, order) => {
    const frameCount = counts[order];
    const startFrame = cursor;
    cursor += frameCount;
    if (p.voice) {
      const words = wordsToFrames(p.voiceWords, fps, startFrame);
      framed = framed.concat(words);
      if (!words.length && p.voiceS)
        spans.push([startFrame, startFrame + Math.ceil(p.voiceS * fps)]);
    }
    if (p.scene.lipsync) {
      spans.push([startFrame, startFrame + frameCount]);
      // The clip speaks the line with no word timings: caption it across the speech.
      if (p.scene.spokenText)
        framed = framed.concat(
          spreadWords(
            p.scene.spokenText,
            startFrame + Math.round(fps * 0.3),
            startFrame + frameCount - TAIL_FRAMES,
          ),
        );
    }
    const transition = sceneTransition(order, p.scene.transition);
    return {
      id: String(p.scene.id),
      order,
      startFrame,
      frameCount,
      still: p.useStill ? p.name : null,
      clip: p.useStill ? null : p.name,
      clipFrames: p.clipFrames,
      voice: p.voice,
      caption: String(p.scene.overlayText ?? "")
        .trim()
        .slice(0, 180),
      move: p.scene.lipsync
        ? "static"
        : WORKSHOP_MOVES[p.index % WORKSHOP_MOVES.length],
      transition,
      transitionFrames: transitionFrames(
        order ? counts[order - 1] : 0,
        frameCount,
        transition,
      ),
      lipsync: p.scene.lipsync === true,
      hasAudio: p.scene.clipHasAudio !== false,
    };
  });
  const scenesEnd = cursor;
  for (const word of framed) spans.push([word.startFrame, word.endFrame]);
  const speech = speechSpans(spans);
  const clipAudio = timeline.clipAudio !== false;
  for (const [order, scene] of scenes.entries()) {
    const end = scene.startFrame + scene.frameCount;
    // A lip-synced clip carries the speech itself; any other clip sits under the narration.
    if (!scene.clip || !scene.hasAudio || picked[order].scene.muteClip)
      scene.clipVolume = 0;
    else if (scene.lipsync) scene.clipVolume = 1;
    else if (!clipAudio) scene.clipVolume = 0;
    else if (speaks(speech, scene.startFrame, end))
      scene.clipVolume = MIX.clipUnderSpeech;
    else scene.clipVolume = MIX.clipSolo;
  }

  const brand = brandOf(timeline.brand, files);
  const endCard =
    brand && (brand.logo || brand.ctaText)
      ? { startFrame: scenesEnd, frameCount: END_CARD_FRAMES }
      : null;
  const totalFrames = scenesEnd + (endCard?.frameCount ?? 0);

  let music = null;
  if (timeline.musicPath) {
    music = `music.${extension(timeline.musicPath)}`;
    files.push({ from: timeline.musicPath, to: music });
  }
  return {
    manifest: {
      schemaVersion: WORKSHOP_SCHEMA,
      composition: "WorkshopFilm",
      fps,
      width,
      height,
      totalFrames,
      narration,
      music,
      musicEnvelope: musicEnvelope(speech, totalFrames),
      captions: captionChunks(framed, fps, scenesEnd),
      clipAudio,
      brand,
      endCard,
      scenes,
    },
    files,
  };
}
