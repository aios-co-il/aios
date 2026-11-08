/**
 * The film's sound, levelled on the local files before either edit mixes it. Each transition
 * sound's hit is brought to EFFECT_LUFS and the impact's to IMPACT_LUFS, a little softer (an
 * ElevenLabs impact came out 15 LU under its whoosh), and, in a trailer, the music bed to
 * MUSIC_LUFS, so the trailer mix's gains are loudness targets. An ordinary film's bed keeps
 * its own level under today's MIX; it is only measured, for where its body ends (the loop
 * hand-over). It runs at render time, so effects stored by earlier renders are levelled too.
 * A cut in a later round of the set gets its sound shifted by its round's pitch
 * (transition-sounds.ts ROUND_PITCH), then levelled like the others. The narration is only
 * measured: the trailer mix sets the bed under it. A file that cannot be read keeps its level,
 * and a sound that cannot be shifted plays as made.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { measureLoudness, normalizeAudio } from "../loudness.ts";
import {
  EFFECT_LUFS,
  IMPACT_LUFS,
  MUSIC_LUFS,
  isTrailer,
} from "./music-bed.ts";
import { pitchAudio } from "./sound-pitch.ts";
import type { CutSound, Timeline } from "./types.ts";
import { levelGain, mean } from "./sound-level.ts";
import type { Gain, Loudness } from "./sound-level.ts";

/**
 * Returns the timeline with its music and effects levelled into `dir` (WAV), each cut's sound
 * at its round's pitch (effects.cuts: { path }), the music track's musical end (musicBodyS,
 * where a loop hands over) and the narration's loudness (voiceLufs).
 */
export async function prepareSound(
  timeline: Timeline,
  dir: string,
  {
    measure = measureLoudness,
    normalize = normalizeAudio,
    vary = pitchAudio,
    log = console.log,
  }: {
    measure?: (file: string) => Promise<Partial<Loudness>>;
    normalize?: (file: string, out: string, gain: Gain) => Promise<unknown>;
    vary?: (file: string, out: string, semitones: number) => Promise<unknown>;
    log?: (line: string) => void;
  } = {},
): Promise<Timeline> {
  await mkdir(dir, { recursive: true });
  const read = async (file: string | null | undefined) => {
    if (!file) return null;
    try {
      return await measure(file);
    } catch (error) {
      log(
        `[sound] ${file} not measured: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  };
  /** The levelled copy of `file`, or `file` itself when it cannot be levelled. */
  const levelled = async (file: string, name: string, gain: Gain | null) => {
    if (!gain) return file;
    const out = join(dir, `${name}-levelled.wav`);
    try {
      await normalize(file, out, gain);
      return out;
    } catch (error) {
      log(
        `[sound] ${name} kept at its own level: ${error instanceof Error ? error.message : error}`,
      );
      return file;
    }
  };

  // Only the trailer mix needs the bed at a known loudness; an ordinary film keeps today's.
  const trailer = isTrailer(timeline);
  const music = await read(timeline.musicPath);
  const musicPath =
    music && trailer && timeline.musicPath
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
  const levelHit = async (path: string, name: string, target: number) => {
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
  /** `file` shifted by `pitch` semitones, or `file` itself when it cannot be. */
  const pitched = async (file: string, name: string, pitch: number) => {
    if (!pitch) return file;
    const out = join(dir, `${name}-pitched.wav`);
    try {
      await vary(file, out, pitch);
      return out;
    } catch (error) {
      log(
        `[sound] ${name} kept at its own pitch: ${error instanceof Error ? error.message : error}`,
      );
      return file;
    }
  };
  let effects = timeline.effects ?? null;
  if (effects) {
    // Each sound at each pitch is made once, however many cuts play it.
    const made = new Map<string, string>();
    const cuts: Array<CutSound> = [];
    for (const { path, pitch = 0 } of effects.cuts ?? []) {
      const key = `${pitch}|${path}`;
      if (!made.has(key)) {
        const name = `sfx-cut-${made.size}`;
        made.set(
          key,
          await levelHit(await pitched(path, name, pitch), name, EFFECT_LUFS),
        );
      }
      cuts.push({ path: made.get(key) ?? path });
    }
    effects = {
      ...effects,
      cuts,
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
      : timeline.scenes
          .map((scene) => scene.voicePath)
          .filter((file): file is string => Boolean(file));
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
