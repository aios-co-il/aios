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
import {
  captionStyleOf,
  lineCharsFor,
  motionCaptions,
} from "./motion-captions.mjs";
import { isTrailer, mixProfile, musicLoops } from "./music-bed.mjs";
import { isSkinSwitch, sceneTransitionFor } from "./skin-switch.mjs";
import {
  MIX,
  effectCues,
  fitScenes,
  musicEnvelope,
  speaks,
  speechSpans,
} from "./workshop-edit.mjs";

export const WORKSHOP_FPS = 30;
export const WORKSHOP_SCHEMA = 3;
const TAIL_FRAMES = 15;
/**
 * A line lip-synced on the still has none of the scene's movement, so the scene's animated clip
 * plays after it (the skin's own move, into the next cut): at least this long, more when the
 * scene was planned longer than its line, never past the animated clip's own length.
 */
export const MOVE_MIN_FRAMES = 36;

/** Frames of the move beat after a talking clip of `clipFrames`, or 0 without one. */
export function moveBeatFrames(baseFrames, clipFrames, moveClipFrames) {
  if (!clipFrames || !moveClipFrames) return 0;
  return Math.min(
    moveClipFrames,
    Math.max(MOVE_MIN_FRAMES, baseFrames - clipFrames),
  );
}
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
    const base = sceneMinFrames(
      {
        durationS: scene.durationS,
        voiceS,
        clipFrames,
        lipsync: scene.lipsync,
      },
      fps,
    );
    // The skin's move after her lip-synced line (lipsync.mjs keeps the animated clip).
    const moveClipFrames =
      scene.lipsync && scene.moveClipPath && seconds(scene.moveClipDurationS)
        ? Math.floor(seconds(scene.moveClipDurationS) * fps)
        : 0;
    const moveFrames = moveBeatFrames(base, clipFrames, moveClipFrames);
    let move = null;
    if (moveFrames) {
      move = `move-${index}.${extension(scene.moveClipPath)}`;
      files.push({ from: scene.moveClipPath, to: move });
    }
    const frames = Math.max(base, (moveFrames && clipFrames + moveFrames) || 0);
    picked.push({
      index,
      scene,
      name,
      useStill,
      voice,
      voiceWords,
      voiceS,
      clipFrames,
      move,
      moveClipFrames,
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
    // The same character in another picture: a skin switch (flash, pop, sweep on the whoosh).
    const { transition, transitionFrames } = sceneTransitionFor(
      order,
      p.scene.transition,
      {
        skin: isSkinSwitch(picked[order - 1]?.scene, p.scene, {
          soundDesign: timeline.soundDesign === true,
        }),
        previousFrames: order ? counts[order - 1] : 0,
        frames: frameCount,
      },
    );
    if (p.scene.lipsync) {
      // Speech only while the talking clip plays: the move after it lets the music up.
      const talkFrames = Math.min(frameCount, p.clipFrames || frameCount);
      spans.push([startFrame, startFrame + talkFrames]);
      // The line's own voice file drove the lips, so its word timings caption the clip, which
      // starts with the scene's transition (workshop-film.tsx). Without them the words share
      // the clip's speech by length.
      const spoken = wordsFromAlignment(p.scene.spokenAlignment);
      if (spoken.length)
        framed = framed.concat(
          wordsToFrames(
            spoken,
            fps,
            startFrame - Math.min(startFrame, transitionFrames || 0),
          ),
        );
      else if (p.scene.spokenText)
        framed = framed.concat(
          spreadWords(
            p.scene.spokenText,
            startFrame + Math.round(fps * 0.3),
            // Over the clip's own speech: a longer scene holds its last frame silently.
            startFrame + talkFrames - TAIL_FRAMES,
          ),
        );
    }
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
      // Over the narration's captions the scene's own short title still shows: at the top
      // over karaoke lines, as a title card over the motion captions.
      kicker: kickerTitle(
        p.scene.overlayText,
        p.scene.voiceoverText || p.scene.spokenText || "",
      ),
      move: p.scene.lipsync
        ? "static"
        : WORKSHOP_MOVES[p.index % WORKSHOP_MOVES.length],
      transition,
      transitionFrames,
      lipsync: p.scene.lipsync === true,
      // After the talking clip: the scene's animated clip, muted, from that picture frame on.
      ...(p.move
        ? {
            moveClip: p.move,
            moveFrom: p.clipFrames,
            moveFrames: p.moveClipFrames,
          }
        : {}),
      hasAudio: p.scene.clipHasAudio !== false,
    };
  });
  const scenesEnd = cursor;
  const captionStyle = captionStyleOf(timeline.captionStyle);
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

  // Trailer sound design, mixed under the voice: ducked like the music bed.
  const fx = timeline.effects;
  const stage = (path, name) => {
    if (!path) return null;
    const to = `${name}.${extension(path)}`;
    files.push({ from: path, to });
    return to;
  };
  const whoosh = fx ? stage(fx.whooshPath, "sfx-whoosh") : null;
  const impact = fx ? stage(fx.impactPath, "sfx-impact") : null;
  const effects =
    whoosh || impact
      ? effectCues(scenes, {
          fps,
          totalFrames,
          whoosh,
          impact,
          whooshFrames: Math.ceil(seconds(fx.whooshDurationS) * fps),
          impactFrames: Math.ceil(seconds(fx.impactDurationS) * fps),
          endCardStart: endCard?.startFrame ?? null,
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
            effectsEnvelope: musicEnvelope(speech, totalFrames, {
              base: mix.effects,
              ducked: mix.effectsDucked,
            }),
          }
        : {}),
      captionStyle,
      captions:
        captionStyle === "motion"
          ? motionCaptions(framed, {
              fps,
              endFrame: scenesEnd,
              // A phrase never runs over a cut, and a scene's title words are its key words.
              breaks: scenes.slice(1).map((scene) => scene.startFrame),
              scenes: scenes.map((scene, order) => ({
                startFrame: scene.startFrame,
                title: picked[order].scene.overlayText ?? "",
              })),
              brand: timeline.brandName ?? "",
              maxLineChars: lineCharsFor(timeline.aspect),
            })
          : captionChunks(framed, fps, scenesEnd),
      clipAudio,
      brand,
      endCard,
      scenes,
    },
    files,
  };
}
