/**
 * The film's sound, levelled on the local files before either edit mixes it. Each transition
 * sound's hit is brought to EFFECT_LUFS and the impact's to IMPACT_LUFS, a little softer (an
 * ElevenLabs impact came out 15 LU under its whoosh), and, in a trailer, the music bed to
 * MUSIC_LUFS, so the trailer mix's gains are loudness targets. An ordinary film's bed keeps
 * its own level under today's MIX; it is only measured, for where its body ends (the loop
 * hand-over). It runs at render time, so effects stored by earlier renders are levelled too.
 * The narration is only measured: the trailer mix sets the bed under it. A file that cannot be
 * read keeps its level.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { measureLoudness, normalizeAudio } from "../ffmpeg.mjs";
import {
  EFFECT_LUFS,
  IMPACT_LUFS,
  MUSIC_LUFS,
  isTrailer,
} from "./music-bed.mjs";

/** Peaks stay under this (dBTP); the limiter takes at most LIMITER_DB above it. */
const CEILING_DB = -1;
const LIMITER_DB = 6;

/**
 * The gain (dB) that brings `measured` to `target`, at most +12 dB and -30 dB. A peak that would
 * pass the ceiling turns the limiter on; a boost the limiter could not hold is cut back.
 * Returns null when there is nothing to measure.
 */
export function levelGain({ measured, target, peak = null }) {
  if (!Number.isFinite(measured) || !Number.isFinite(target)) return null;
  let gainDb = Math.min(12, Math.max(-30, target - measured));
  const top = Number.isFinite(peak) ? peak : 0;
  if (top + gainDb > CEILING_DB + LIMITER_DB)
    gainDb = CEILING_DB + LIMITER_DB - top;
  return {
    gainDb: Math.round(gainDb * 100) / 100,
    limit: top + gainDb > CEILING_DB,
  };
}

const mean = (values) => {
  const heard = values.filter(Number.isFinite);
  if (!heard.length) return null;
  return (
    Math.round((heard.reduce((sum, v) => sum + v, 0) / heard.length) * 10) / 10
  );
};

/**
 * Returns the timeline with its music and effects levelled into `dir` (WAV), the music track's
 * musical end (musicBodyS, where a loop hands over) and the narration's loudness (voiceLufs).
 */
export async function prepareSound(
  timeline,
  dir,
  {
    measure = measureLoudness,
    normalize = normalizeAudio,
    log = console.log,
  } = {},
) {
  await mkdir(dir, { recursive: true });
  const read = async (file) => {
    if (!file) return null;
    try {
      return await measure(file);
    } catch (error) {
      log(`[sound] ${file} not measured: ${error?.message ?? error}`);
      return null;
    }
  };
  /** The levelled copy of `file`, or `file` itself when it cannot be levelled. */
  const levelled = async (file, name, gain) => {
    if (!gain) return file;
    const out = join(dir, `${name}-levelled.wav`);
    try {
      await normalize(file, out, gain);
      return out;
    } catch (error) {
      log(`[sound] ${name} kept at its own level: ${error?.message ?? error}`);
      return file;
    }
  };

  // Only the trailer mix needs the bed at a known loudness; an ordinary film keeps today's.
  const trailer = isTrailer(timeline);
  const music = await read(timeline.musicPath);
  const musicPath =
    music && trailer
      ? await levelled(
          timeline.musicPath,
          "music",
          levelGain({
            measured: music.integrated,
            target: MUSIC_LUFS,
            peak: music.truePeak,
          }),
        )
      : (timeline.musicPath ?? null);

  /** A one-shot is levelled by its hit (the loudest 400 ms), not by its decaying tail. */
  const levelHit = async (path, name, target) => {
    const loudness = await read(path);
    if (!loudness) return path;
    return levelled(
      path,
      name,
      levelGain({
        measured: loudness.maxMomentary ?? loudness.integrated,
        target,
        peak: loudness.truePeak,
      }),
    );
  };
  let effects = timeline.effects ?? null;
  if (effects) {
    const transitionPaths = [];
    for (const [index, path] of (effects.transitionPaths ?? []).entries())
      transitionPaths.push(
        await levelHit(path, `sfx-cut-${index}`, EFFECT_LUFS),
      );
    effects = {
      ...effects,
      transitionPaths,
      impactPath: effects.impactPath
        ? await levelHit(effects.impactPath, "sfx-impact", IMPACT_LUFS)
        : null,
    };
  }

  // Only the trailer mix sets the bed by the voice; an ordinary film's levels are fixed.
  const voices = !trailer
    ? []
    : timeline.narrationPath
      ? [timeline.narrationPath]
      : timeline.scenes.map((scene) => scene.voicePath).filter(Boolean);
  const voiceLufs = mean(
    await Promise.all(
      voices.map(async (file) => (await read(file))?.integrated ?? null),
    ),
  );
  return {
    ...timeline,
    musicPath,
    musicBodyS: music?.bodyEndS ?? null,
    effects,
    voiceLufs,
  };
}
