/** Which picture or clip each scene shows in the Remotion film, and how many frames it needs. */
import { wordsFromAlignment, wordsToFrames } from "./captions.ts";
import { lineFrames } from "./line-sync.ts";
import {
  TAIL_FRAMES,
  WORKSHOP_FPS,
  extension,
  lastEnd,
  seconds,
} from "./manifest-media.ts";
import { PREVIEW_PROVIDER } from "../providers/index.ts";
import { fitScenes } from "./workshop-edit.ts";

/**
 * The scenes that have a picture or clip, each with its files staged in `files` and its shortest
 * length in frames.
 */
export function pickScenes(timeline, files, fps) {
  const picked = [];
  for (const [index, scene] of timeline.scenes.entries()) {
    const provider = scene.clipProvider || PREVIEW_PROVIDER;
    const useStill =
      provider === PREVIEW_PROVIDER && scene.stillPath && !scene.lipsync;
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
    // The skin's move after her lip-synced line (lipsync.ts keeps the animated clip).
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
  return picked;
}

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
 * line (line-sync.ts), else the scenes stretch evenly, so the take is never cut. The music job
 * sizes the bed with the same rule (jobs/music-length.ts).
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
