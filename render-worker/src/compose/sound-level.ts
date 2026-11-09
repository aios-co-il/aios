/** The gain that brings a sound file to a loudness target (sound-prep.ts). */
import type { measureLoudness } from "../loudness.ts";

/** Peaks stay under this (dBTP); the limiter takes at most LIMITER_DB above it. */
const CEILING_DB = -1;
const LIMITER_DB = 6;

/**
 * The gain (dB) that brings `measured` to `target`, at most +12 dB and -30 dB. A peak that would
 * pass the ceiling turns the limiter on; a boost the limiter could not hold is cut back.
 * Returns null when there is nothing to measure.
 */
export function levelGain({
  measured,
  target,
  peak = null,
}: {
  measured: number | null | undefined;
  target: number;
  peak?: number | null;
}) {
  if (
    typeof measured !== "number" ||
    !Number.isFinite(measured) ||
    !Number.isFinite(target)
  ) {
    return null;
  }
  let gainDb = Math.min(12, Math.max(-30, target - measured));
  const top = typeof peak === "number" && Number.isFinite(peak) ? peak : 0;
  if (top + gainDb > CEILING_DB + LIMITER_DB) {
    gainDb = CEILING_DB + LIMITER_DB - top;
  }
  return {
    gainDb: Math.round(gainDb * 100) / 100,
    limit: top + gainDb > CEILING_DB,
  };
}

/** The mean of the readings that were heard, to 0.1; null when none was. */
export const mean = (values: Array<number | null>) => {
  const heard = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (!heard.length) {
    return null;
  }
  return (
    Math.round((heard.reduce((sum, v) => sum + v, 0) / heard.length) * 10) / 10
  );
};

/** A file's loudness as measureLoudness reads it (loudness.ts parseLoudness). */
export type Loudness = Awaited<ReturnType<typeof measureLoudness>>;

/** The gain levelGain sets, as normalizeAudio takes it. */
export type Gain = NonNullable<ReturnType<typeof levelGain>>;
