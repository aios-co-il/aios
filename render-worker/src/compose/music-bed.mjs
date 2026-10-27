/**
 * The film's music bed: its mix profile (an ordinary film's MIX, or the trailer mix of a film
 * with sound design) and the copies of a short track laid end to end so the bed covers the
 * whole film. Both edits use these: the Remotion manifest (workshop-manifest.mjs) and the ffmpeg
 * concat (assemble.mjs).
 */
import { MIX } from "./workshop-edit.mjs";

/**
 * Integrated loudness the music bed is brought to before the gains. A typical ElevenLabs
 * track sits here, so a film without sound design keeps the level it had.
 */
export const MUSIC_LUFS = -17;
/** Each sound effect's loudest moment (momentary LUFS) after normalization. */
export const EFFECT_LUFS = -14;
/** The narration's loudness when it cannot be measured (an ElevenLabs take reads about -19). */
export const VOICE_LUFS = -19;

/**
 * The trailer mix of a film with sound design: the bed comes up to about -21.5 LUFS when
 * nobody speaks (title, long pauses, end card) and sits 13.5 dB under the voice while she
 * speaks. A pause shorter than a second keeps the bed down, so it does not pump.
 */
export const TRAILER = {
  bedLufs: -21.5,
  underVoiceDb: 13.5,
  attack: 6,
  release: 12,
  hold: 12,
};

/**
 * True for a film that gets the trailer mix: the brief asked for sound design
 * (video.sound_design), or the film has its effects.
 */
export const isTrailer = (timeline) =>
  timeline?.soundDesign === true || Boolean(timeline?.effects);

const dbGain = (db) => Math.round(10 ** (db / 20) * 1000) / 1000;

/**
 * The film's mix: today's MIX for an ordinary film, the trailer profile when the film has
 * sound design. `voiceLufs` (the measured narration) sets how far the bed dips under it.
 * `bed` is the music bed's envelope options (musicEnvelope in workshop-edit.mjs).
 */
export function mixProfile({ trailer = false, voiceLufs = null } = {}) {
  const ramps = trailer
    ? { attack: TRAILER.attack, release: TRAILER.release, hold: TRAILER.hold }
    : { attack: 8, release: 14, hold: 0 };
  const voice = Number.isFinite(voiceLufs)
    ? Math.min(-12, Math.max(-30, voiceLufs))
    : VOICE_LUFS;
  const music = trailer ? dbGain(TRAILER.bedLufs - MUSIC_LUFS) : MIX.music;
  const musicDucked = trailer
    ? Math.min(music, dbGain(voice - TRAILER.underVoiceDb - MUSIC_LUFS))
    : MIX.musicDucked;
  return {
    ...MIX,
    ...ramps,
    trailer,
    music,
    musicDucked,
    bed: { base: music, ducked: musicDucked, ...ramps },
  };
}

/** The Remotion film's frame rate (WORKSHOP_FPS); the frame counts below are at this rate. */
const FILM_FPS = 30;
/** Seconds over which one copy of a looped music bed hands over to the next. */
export const MUSIC_CROSSFADE_S = 1.5;
/**
 * The film's closing fade, where the music bed fades out with the picture (workshop-film.tsx
 * fades the bed over the same 45 frames).
 */
export const MUSIC_END_FADE_S = 1.5;
/** Seconds of a track's own ending that may play before the film's fade, instead of a copy. */
export const MUSIC_OUTRO_S = 1;
export const MUSIC_CROSSFADE = MUSIC_CROSSFADE_S * FILM_FPS;
export const MUSIC_END_FADE = MUSIC_END_FADE_S * FILM_FPS;
/** At most this many copies of the track; render-job.mjs accepts no more. */
export const MAX_MUSIC_LOOPS = 50;

/**
 * Copies of the music laid end to end until the bed covers the whole film. Each copy plays the
 * track from its start; a copy that hands over ends at the track's musical end (`bodyFrames`,
 * before its outro dies away) with an equal-power crossfade into the next one. The last copy
 * runs to the film's end, where the film's own fade takes it out. One copy is enough when the
 * track's body, and at most `outro` frames of its ending, reach the film's closing fade; a
 * track whose music dies away earlier starts again from its top, so the call to action and the
 * end card never play over a fading tail.
 */
export function musicLoops(
  musicFrames,
  totalFrames,
  {
    bodyFrames = musicFrames,
    crossfade = MUSIC_CROSSFADE,
    endFade = MUSIC_END_FADE,
    outro = MUSIC_OUTRO_S * FILM_FPS,
  } = {},
) {
  if (!(musicFrames > 0) || !(totalFrames > 0)) return [];
  const body = Math.max(
    1,
    Math.min(musicFrames, Math.round(bodyFrames) || musicFrames),
  );
  const fade = Math.max(0, Math.min(crossfade, Math.floor(body / 3)));
  const ending = Math.min(outro, musicFrames - body);
  const loops = [];
  let start = 0;
  for (;;) {
    // The last copy reaches the film's fade with its body (or a short outro) and lasts to the
    // film's final frame.
    const last =
      (start + body + ending >= totalFrames - endFade &&
        start + musicFrames >= totalFrames) ||
      loops.length >= MAX_MUSIC_LOOPS - 1;
    loops.push({
      startFrame: start,
      frameCount: last
        ? Math.min(Math.floor(musicFrames), totalFrames - start)
        : body,
      fadeInFrames: loops.length ? fade : 0,
      fadeOutFrames: last ? 0 : fade,
    });
    if (last) return loops;
    start += body - fade;
  }
}
