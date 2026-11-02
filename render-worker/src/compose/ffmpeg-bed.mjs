/**
 * The music bed of the ffmpeg edit (assemble.mjs, REMOTION_DISABLE=1): the track looped to the
 * film's length like the Remotion edit (music-bed.mjs musicLoops), at a steady level or, for a
 * trailer, following the same volume envelope as the Remotion bed, and faded out with the film.
 */
import {
  MUSIC_CROSSFADE_S,
  MUSIC_END_FADE_S,
  MUSIC_OUTRO_S,
  isTrailer,
  mixProfile,
  musicLoops,
} from "./music-bed.mjs";
import { musicEnvelope } from "./workshop-edit.mjs";

const STEREO = "aformat=sample_rates=48000:channel_layouts=stereo";
const round3 = (value) => Math.round(value * 1000) / 1000;
/** The ffmpeg edit's music level for a film without sound design (unchanged). */
const MUSIC_STEADY = 0.18;

/**
 * An ffmpeg `volume` expression of t that follows the envelope's keyframes (frames at `fps`),
 * straight lines between them: the ffmpeg counterpart of the Remotion bed's level.
 */
export function envelopeExpression({ frames, volumes }, fps) {
  const times = frames.map((frame) => round3(frame / fps));
  const parts = [];
  for (let i = 0; i + 1 < times.length; i++) {
    const [from, to] = [times[i], times[i + 1]];
    const [a, b] = [volumes[i], volumes[i + 1]];
    if (to <= from) continue;
    const value =
      a === b
        ? `${a}`
        : `(${a}+${round3(b - a)}*(t-${from})/${round3(to - from)})`;
    parts.push(`gte(t,${from})*lt(t,${to})*${value}`);
  }
  parts.push(`gte(t,${times.at(-1)})*${volumes.at(-1)}`);
  return parts.join("+");
}

/**
 * The filters that make the music bed `[m]` from input `input`: copies of the track laid end to
 * end until the film is covered (musicLoops; each hand-over an equal-power crossfade at the
 * track's musical end), set to `volume` (a level, or an expression of t), and faded out with the
 * film's last 1.5 s.
 */
export function musicBedFilters({
  input,
  musicS,
  bodyS = null,
  filmS,
  volume,
  fps = 25,
}) {
  const loops = musicLoops(Math.floor(musicS * fps), Math.ceil(filmS * fps), {
    bodyFrames: bodyS ? Math.floor(bodyS * fps) : undefined,
    crossfade: Math.round(MUSIC_CROSSFADE_S * fps),
    endFade: Math.round(MUSIC_END_FADE_S * fps),
    outro: Math.round(MUSIC_OUTRO_S * fps),
  });
  const filters = [];
  if (loops.length > 1) {
    const copies = loops.map((_, i) => `[mloop${i}]`);
    filters.push(
      `[${input}:a]${STEREO},asplit=${loops.length}${copies.join("")}`,
    );
    for (const [i, loop] of loops.entries()) {
      const length = round3(loop.frameCount / fps);
      const fade = [
        loop.fadeInFrames
          ? `,afade=t=in:d=${round3(loop.fadeInFrames / fps)}:curve=qsin`
          : "",
        loop.fadeOutFrames
          ? `,afade=t=out:st=${round3(length - loop.fadeOutFrames / fps)}:d=${round3(loop.fadeOutFrames / fps)}:curve=qsin`
          : "",
      ].join("");
      filters.push(
        `${copies[i]}atrim=0:${length},asetpts=PTS-STARTPTS${fade},adelay=${Math.round((loop.startFrame / fps) * 1000)}:all=1[mpart${i}]`,
      );
    }
    filters.push(
      `${loops.map((_, i) => `[mpart${i}]`).join("")}amix=inputs=${loops.length}:duration=longest:dropout_transition=0:normalize=0[mbed]`,
    );
  } else filters.push(`[${input}:a]${STEREO}[mbed]`);
  const level =
    typeof volume === "number"
      ? `volume=${volume}`
      : `volume='${volume}':eval=frame`;
  // Sample-count timestamps after the mix, so the level's t and the fade see film time.
  filters.push(
    `[mbed]apad=whole_dur=${round3(filmS)},atrim=0:${round3(filmS)},asetpts=N/SR/TB,${level},afade=t=out:st=${round3(Math.max(0, filmS - MUSIC_END_FADE_S))}:d=${MUSIC_END_FADE_S}[m]`,
  );
  return { filters, loops };
}

/** Spoken spans in seconds as frames at `fps`. */
const spanFrames = (spans, fps) =>
  spans.map(([start, end]) => [Math.round(start * fps), Math.round(end * fps)]);

/**
 * The effects' level in the ffmpeg edit, an expression of t: the trailer mix's effect gains on
 * the same envelope as the Remotion edit's effects (up with the bed between lines, down under
 * every spoken span). Effects play only in a trailer.
 */
export function effectsVolume(timeline, spans, filmS, fps) {
  const mix = mixProfile({
    trailer: true,
    voiceLufs: timeline.voiceLufs ?? null,
  });
  const envelope = musicEnvelope(
    spanFrames(spans, fps),
    Math.ceil(filmS * fps),
    mix.fx,
  );
  return envelopeExpression(envelope, fps);
}

/**
 * The bed's level in the ffmpeg edit: the trailer mix ducks it under every spoken span like the
 * Remotion edit; an ordinary film keeps its steady level under the voice.
 */
export function bedVolume(timeline, spans, filmS, fps) {
  const mix = mixProfile({
    trailer: isTrailer(timeline),
    voiceLufs: timeline.voiceLufs ?? null,
  });
  if (!mix.trailer) return MUSIC_STEADY;
  const envelope = musicEnvelope(
    spanFrames(spans, fps),
    Math.ceil(filmS * fps),
    mix.bed,
  );
  return envelopeExpression(envelope, fps);
}
