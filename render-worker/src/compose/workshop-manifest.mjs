/** The edit Remotion renders. A mock clip is a still with a zoom, so the
 * composition animates the still. A real video clip is placed on the timeline as-is. */
import { brandColor, brandFont } from "./brand.mjs";
import { MAX_CTA_CHARS, ctaLines, endCardSeconds } from "./end-card.mjs";
import { lineFrames } from "./line-sync.mjs";
import {
  captionChunks,
  spreadWords,
  wordsFromAlignment,
  wordsToFrames,
} from "./captions.mjs";
import { kickerTitle } from "./kicker.mjs";
import { isTrailer, mixProfile, musicLoops } from "./music-bed.mjs";
import {
  MIX,
  effectCues,
  fitScenes,
  musicEnvelope,
  sceneTransition,
  speaks,
  speechSpans,
  transitionFrames,
} from "./workshop-edit.mjs";

export const WORKSHOP_FPS = 30;
export const WORKSHOP_SCHEMA = 3;
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
export const lastEnd = (words) => words.reduce((n, w) => Math.max(n, w.end), 0);

/**
 * A scene's shortest length in frames. Speech is never cut: a scene lasts as long as its own
 * voice (plus a short tail) or its lip-synced clip.
 */
export function sceneMinFrames(
  { durationS = 0, voiceS = 0, clipFrames = null, lipsync = false },
  fps = WORKSHOP_FPS,
) {
  return Math.max(
    15,
    Math.round(seconds(durationS) * fps),
    voiceS ? Math.ceil(voiceS * fps) + TAIL_FRAMES : 0,
    lipsync && clipFrames ? clipFrames : 0,
  );
}

/**
 * Scene lengths in frames under one continuous narration take: each scene starts with its own
 * line (line-sync.mjs), else the scenes stretch evenly, so the take is never cut. The music job
 * sizes the bed with the same rule (jobs/music-length.mjs).
 */
export function narratedSceneFrames(
  minFrames,
  { lines = [], words = [], narrationS = 0, fps = WORKSHOP_FPS } = {},
) {
  const takeFrames =
    narrationS > 0 ? Math.ceil(narrationS * fps) + TAIL_FRAMES : 0;
  return (
    (takeFrames &&
      lineFrames(lines, wordsToFrames(words, fps), minFrames, takeFrames)) ||
    fitScenes(minFrames, takeFrames)
  );
}

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
        .slice(0, MAX_CTA_CHARS) || null,
    ctaUrl:
      String(brand.ctaUrl ?? "")
        .trim()
        .slice(0, 120) || null,
  };
  if (!Object.values(out).some(Boolean)) return null;
  // A whole-sentence call to action is shown in up to three balanced lines (end-card.mjs).
  return out.ctaText ? { ...out, ctaLines: ctaLines(out.ctaText) } : out;
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
    const frames = sceneMinFrames(
      {
        durationS: scene.durationS,
        voiceS,
        clipFrames,
        lipsync: scene.lipsync,
      },
      fps,
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
  let narrationS = 0;
  if (timeline.narrationPath) {
    narration = `narration.${extension(timeline.narrationPath)}`;
    files.push({ from: timeline.narrationPath, to: narration });
    narrationWords = wordsFromAlignment(timeline.narrationAlignment);
    narrationS = Math.max(
      seconds(timeline.narrationDurationS),
      lastEnd(narrationWords),
    );
  }
  const narrationFrames = narrationS
    ? Math.ceil(narrationS * fps) + TAIL_FRAMES
    : 0;
  // One continuous take: each scene starts with its own line, else scenes stretch evenly.
  const counts = narratedSceneFrames(
    picked.map((p) => p.frames),
    {
      lines: picked.map((p) => p.scene.narrationText ?? ""),
      words: narrationWords,
      narrationS,
      fps,
    },
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
            // Over the clip's own speech: a longer scene holds its last frame silently.
            startFrame +
              Math.min(frameCount, p.clipFrames || frameCount) -
              TAIL_FRAMES,
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
      // Over karaoke captions the scene's own short title still shows, at the top.
      kicker: kickerTitle(
        p.scene.overlayText,
        p.scene.voiceoverText || p.scene.spokenText || "",
      ),
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
    brand && timeline.brand?.endCard !== false && (brand.logo || brand.ctaText)
      ? {
          startFrame: scenesEnd,
          frameCount: Math.round(endCardSeconds(brand.ctaLines ?? []) * fps),
        }
      : null;
  const totalFrames = scenesEnd + (endCard?.frameCount ?? 0);

  let music = null;
  let loops = [];
  if (timeline.musicPath) {
    music = `music.${extension(timeline.musicPath)}`;
    files.push({ from: timeline.musicPath, to: music });
    // A track shorter than the film is looped, so the film never ends in silence.
    const musicFrames = Math.floor(seconds(timeline.musicDurationS) * fps);
    const bodyFrames = Math.floor(seconds(timeline.musicBodyS) * fps);
    if (musicFrames)
      loops = musicLoops(musicFrames, totalFrames, {
        bodyFrames: bodyFrames || musicFrames,
      });
  }
  // A film with trailer sound design gets the trailer mix; every other film keeps MIX.
  const mix = mixProfile({
    trailer: isTrailer(timeline),
    voiceLufs: timeline.voiceLufs ?? null,
  });

  // Trailer sound design, mixed under the voice: ducked like the music bed. Each cut plays its
  // own sound (the timeline's plan, transition-sounds.mjs); a file two cuts share is staged once.
  const fx = timeline.effects;
  const stage = (path, name) => {
    if (!path) return null;
    const to = `${name}.${extension(path)}`;
    files.push({ from: path, to });
    return to;
  };
  const staged = new Map();
  const cutSounds = (fx?.cuts ?? []).slice(0, scenes.length - 1).map((cut) => {
    if (!staged.has(cut.path))
      staged.set(cut.path, {
        file: stage(cut.path, `sfx-cut-${staged.size}`),
        frames: Math.ceil(seconds(cut.durationS) * fps),
      });
    return staged.get(cut.path);
  });
  const impact = fx ? stage(fx.impactPath, "sfx-impact") : null;
  const effects =
    cutSounds.length || impact
      ? effectCues(scenes, {
          fps,
          totalFrames,
          impact,
          impactFrames: Math.ceil(seconds(fx.impactDurationS) * fps),
          endCardStart: endCard?.startFrame ?? null,
          cutSounds,
        })
      : [];
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
      ...(loops.length ? { musicLoops: loops } : {}),
      musicEnvelope: musicEnvelope(speech, totalFrames, mix.bed),
      ...(effects.length
        ? {
            effects,
            effectsEnvelope: musicEnvelope(speech, totalFrames, mix.fx),
          }
        : {}),
      captions: captionChunks(framed, fps, scenesEnd),
      clipAudio,
      brand,
      endCard,
      scenes,
    },
    files,
  };
}
