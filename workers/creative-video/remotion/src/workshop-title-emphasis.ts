/**
 * How the key words of a scene's motion title (numbers, prices, percents, dates; see
 * workshop-title-timing.ts) are emphasised once they are in, for each effect Carmen can choose.
 * Pure numbers per frame, so every effect is tested without rendering; the drawing is in
 * workshop-title-emphasis-view.tsx.
 */
import { TITLE_EXIT } from "./workshop-title-timing";

/** The effects, in the order Carmen's tools list them (render-worker title-style.mjs). */
export const TITLE_EMPHASES = [
  "none",
  "count",
  "underline",
  "circle",
  "stamp",
  "marker",
  "shake",
] as const;

export type TitleEmphasis = (typeof TITLE_EMPHASES)[number];

export const isTitleEmphasis = (value: unknown): value is TitleEmphasis =>
  typeof value === "string" &&
  (TITLE_EMPHASES as readonly string[]).includes(value);

/** Frames after a word starts entering before its emphasis starts, and the longest emphasis. */
export const EMPHASIS_LAG = 8;
export const EMPHASIS_FRAMES = 20;

/**
 * The scene frame a word's emphasis starts at: once it is in, but early enough to finish before
 * the text leaves a scene `frames` long, and never before the word itself starts.
 */
export function emphasisStart(at: number, frames: number): number {
  const latest = frames - TITLE_EXIT - EMPHASIS_FRAMES;
  return Math.max(at, Math.min(at + EMPHASIS_LAG, latest));
}

/**
 * One key word's emphasis at a frame. `count`, `line` (underline or circle drawn), `marker`
 * (the bar swept) and `box` (the stamp's outline) are shares from 0 to 1; the word's extra
 * offsets are in ems and its rotation in degrees.
 */
export type EmphasisLook = {
  count: number;
  line: number;
  marker: number;
  box: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const easeInOut = (x: number) => {
  const c = clamp01(x);
  return c < 0.5 ? 4 * c ** 3 : 1 - (-2 * c + 2) ** 3 / 2;
};

/** The frame the stamp hits the page, and its tilt once it has. */
const STAMP_HIT = 8;
export const STAMP_TILT = -7;

/** A word `t` frames after its emphasis starts; before that (t < 0) nothing is drawn yet. */
export function emphasisLook(effect: TitleEmphasis, t: number): EmphasisLook {
  const still = {
    count: 1,
    line: 0,
    marker: 0,
    box: 0,
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
  };
  switch (effect) {
    case "count":
      // Counts up from 0, fast first and slowing into its value.
      return { ...still, count: easeOut(t / 18) };
    case "underline":
      return { ...still, line: easeOut(t / 10) };
    case "circle":
      // A pen stroke: slow start, quick middle, slow close.
      return { ...still, line: easeInOut(t / 14) };
    case "marker":
      return { ...still, marker: easeOut(t / 10) };
    case "stamp":
      return { ...still, ...stampAt(t) };
    case "shake":
      return { ...still, ...shakeAt(t) };
    case "none":
    default:
      return still;
  }
}

/** Lifted, tilted and slammed down; it jitters on the hit and the outline box appears. */
function stampAt(t: number) {
  if (t < 0) {
    return {};
  }
  const lift = t < 5 ? 1 + 0.35 * easeOut(t / 5) : 0;
  const slam = t < STAMP_HIT ? 1.35 - 0.45 * ((t - 5) / 3) : 0;
  const settle = 0.9 + 0.1 * easeOut((t - STAMP_HIT) / 6);
  const scale = t < 5 ? lift : t < STAMP_HIT ? slam : settle;
  const decay = clamp01(1 - (t - STAMP_HIT) / 8);
  const jitter = t >= STAMP_HIT ? decay * 0.035 : 0;
  return {
    scale,
    rotate: STAMP_TILT * easeOut(t / 5),
    x: Math.sin(t * 2.7) * jitter,
    y: Math.cos(t * 3.1) * jitter,
    box: t >= STAMP_HIT ? 1 : 0,
  };
}

/** A short shake that dies out. */
function shakeAt(t: number) {
  if (t < 0) {
    return {};
  }
  const decay = clamp01(1 - t / 14);
  return {
    x: Math.sin(t * 1.9) * 0.12 * decay,
    rotate: Math.sin(t * 2.3) * 6 * decay,
  };
}

/** A number that can count: its value, the decimals and grouping it is written with. */
export type Countable = {
  prefix: string;
  suffix: string;
  value: number;
  decimals: number;
  grouped: boolean;
};

// A plain number, optionally with thousands commas and a decimal part, between an optional
// currency sign and an optional %, currency sign or closing punctuation.
const NUMBER =
  /^([₪$]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?((?:%|₪|\$)?[!?,]*)$/;

/**
 * The number in `word` to count up, or null when it is not one plain number: a date
 * (31.12.26), a time (10:00), a phone number or a number inside a word stays as it is. A bare
 * decimal (31.12) could be a date, so a decimal counts only with a sign beside it.
 */
export function countable(word: string): Countable | null {
  const match = NUMBER.exec(word);
  if (!match) {
    return null;
  }
  const [, prefix, whole, fraction = "", suffix] = match;
  const signed = Boolean(prefix) || /[%₪$]/.test(suffix);
  if (fraction && !signed) {
    return null;
  }
  return {
    prefix,
    suffix,
    value: Number(`${whole.replace(/,/g, "")}.${fraction || "0"}`),
    decimals: fraction.length,
    grouped: whole.includes(","),
  };
}

/** The number written as it would read `share` of the way up from 0 to its value. */
export function countText(number: Countable, share: number): string {
  const value = number.value * clamp01(share);
  const digits = value.toLocaleString("en-US", {
    minimumFractionDigits: number.decimals,
    maximumFractionDigits: number.decimals,
    useGrouping: number.grouped,
  });
  return `${number.prefix}${digits}${number.suffix}`;
}
