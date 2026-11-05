/** The Remotion film's scenes on the timeline: where each starts, how it enters and what it says. */
import { spreadWords, wordsFromAlignment, wordsToFrames } from "./captions.ts";
import { kickerTitle } from "./kicker.ts";
import { TAIL_FRAMES } from "./manifest-media.ts";
import { overlayFieldOf } from "./scene-overlay.ts";
import { isSkinSwitch, sceneTransitionFor } from "./skin-switch.ts";

export const WORKSHOP_MOVES = [
  "push",
  "drift-left",
  "rise",
  "drift-right",
  "pull",
];

/**
 * Places the picked scenes one after another at their fitted frame counts. Returns the scenes,
 * every caption word in film frames (`framed`), the speech spans known so far, and where the
 * scenes end.
 */
export function placeScenes(
  picked,
  counts,
  timeline,
  { narration, narrationWords, narrationFrames },
  fps,
) {
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
      // A finished design is shown whole over a blurred copy of itself, never cropped.
      ...(p.useStill && timeline.keepDesign === true ? { fit: "contain" } : {}),
      // How the scene's text enters, its size and emphasis: its own choice, else the film's.
      ...titleLookOf(p.scene, timeline),
      // The graphics over its picture, under its text: its own choice, else the film's.
      ...overlayFieldOf(p.scene, timeline),
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
      // Set below, once the speech under the whole film is known.
      clipVolume: 0,
    };
  });
  return { scenes, framed, spans, scenesEnd: cursor };
}

/**
 * A scene's text style, size and key-word emphasis for the manifest: its own, else the film's,
 * else none.
 */
function titleLookOf(scene, timeline) {
  const titleStyle = scene.titleStyle || timeline.titleStyle || null;
  const titleSize = scene.titleSize || timeline.titleSize || null;
  const titleEmphasis = scene.titleEmphasis || timeline.titleEmphasis || null;
  return {
    ...(titleStyle ? { titleStyle } : {}),
    ...(titleSize ? { titleSize } : {}),
    ...(titleEmphasis ? { titleEmphasis } : {}),
  };
}
