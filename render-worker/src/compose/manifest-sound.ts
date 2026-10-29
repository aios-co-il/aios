/** The Remotion film's sound: the narration take, each clip's own volume, the music bed and effects. */
import { wordsFromAlignment } from "./captions.ts";
import { TAIL_FRAMES, extension, lastEnd, seconds } from "./manifest-media.ts";
import { musicLoops } from "./music-bed.ts";
import { MIX, effectCues, speaks, speechSpans } from "./workshop-edit.ts";

/** The film's one narration take, staged in `files`, with its words and length. */
export function stageNarration(timeline, files, fps) {
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
  return { narration, narrationWords, narrationS, narrationFrames };
}

/**
 * Sets each scene's clip volume from the speech under the whole film, and returns that speech
 * and whether clips play their own sound.
 */
export function setClipVolumes(scenes, picked, timeline, framed, spans) {
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
  return { speech, clipAudio };
}

/** The music bed staged in `files`, and its loops when the track is shorter than the film. */
export function stageMusic(timeline, files, totalFrames, fps) {
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
  return { music, loops };
}

/**
 * Trailer sound design, mixed under the voice: ducked like the music bed. Each cut plays its
 * own sound (the timeline's plan, transition-sounds.ts); a file two cuts share is staged once.
 */
export function stageEffects(
  timeline,
  files,
  scenes,
  { fps, totalFrames, endCard },
) {
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
  return cutSounds.length || impact
    ? effectCues(scenes, {
        fps,
        totalFrames,
        impact,
        impactFrames: Math.ceil(seconds(fx.impactDurationS) * fps),
        endCardStart: endCard?.startFrame ?? null,
        cutSounds,
      })
    : [];
}
