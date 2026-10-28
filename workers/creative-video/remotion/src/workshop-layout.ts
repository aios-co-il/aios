/**
 * Where the Workshop film's motion captions and title card sit, and how large they are, for
 * each frame shape. On a phone frame (9:16) Reels and TikTok draw their own UI over the top 14%
 * and the bottom 22%, so the captions sit in the lower middle, clear of both, and the scene's
 * title card sits right above them. A scene's longer on-screen text sits at the top, under the
 * top band; without spoken captions, it sits where the captions would.
 */

/** A key word is drawn this much larger (render-worker motion-captions.mjs KEY_WIDTH). */
export const KEY_SCALE = 1.3;
/** Width of a bold Hebrew glyph in ems, on average (Heebo Bold). */
export const GLYPH_EM = 0.58;
/** Space between words and each word's side padding (room for the highlight), in ems. */
export const WORD_GAP_EM = 0.24;
export const WORD_PAD_EM = 0.12;
export const LINE_HEIGHT = 1.14;
/** Frames a caption word starts entering before it is said. */
export const LEAD = 3;

/** 0 at x <= 0, 1 at x >= frames, linear between. */
export const ramp = (x: number, frames: number) =>
  Math.min(1, Math.max(0, frames > 0 ? x / frames : x >= 0 ? 1 : 0));

export type CaptionLayout = {
  /** A phone frame (9:16). */
  tall: boolean;
  /** Caption size before a long line shrinks it, in px. */
  fontSize: number;
  /** Space below the caption box, in px. */
  bottom: number;
  /** Height kept for two caption lines with a key word, in px. */
  box: number;
  /** Widest a caption line may be, in px. */
  safeWidth: number;
  /** Space below the title card, in px: right above the caption box. */
  titleBottom: number;
  titleFontSize: number;
  /** Space above the scene's on-screen text at the top of the frame, in px. */
  top: number;
  /** The scene's on-screen text, in px. */
  sceneFontSize: number;
};

export function captionLayout(width: number, height: number): CaptionLayout {
  const tall = height >= width * 1.6;
  const portrait = height > width * 1.1;
  const fontSize = Math.round(
    Math.min(width * 0.093, height * (tall ? 0.052 : portrait ? 0.05 : 0.068)),
  );
  const bottom = Math.round(height * (tall ? 0.235 : portrait ? 0.15 : 0.085));
  const box = Math.round(2 * LINE_HEIGHT * fontSize * KEY_SCALE);
  return {
    tall,
    fontSize,
    bottom,
    box,
    safeWidth: Math.round(width * (portrait ? 0.88 : 0.74)),
    titleBottom: bottom + box + Math.round(fontSize * 0.25),
    titleFontSize: Math.round(
      Math.min(
        width * 0.075,
        height * (tall ? 0.04 : portrait ? 0.042 : 0.056),
      ),
    ),
    top: Math.round(height * (tall ? 0.155 : portrait ? 0.08 : 0.06)),
    sceneFontSize: Math.round(height * 0.032),
  };
}

/** A line's width in ems of the caption size: its words, their padding and the gaps. */
export const lineEm = (words: { text: string; key?: boolean }[]) =>
  words.reduce(
    (sum, word) =>
      sum +
      ([...word.text].length * GLYPH_EM + 2 * WORD_PAD_EM) *
        (word.key ? KEY_SCALE : 1),
    0,
  ) +
  WORD_GAP_EM * Math.max(0, words.length - 1);

const channels = (hex: string): [number, number, number] | null => {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
};

/** Relative luminance (WCAG) of a hex colour; 0 for anything else. */
export function luminance(hex: string): number {
  const rgb = channels(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Text drawn on the accent colour: near-black or white, whichever reads better. */
export const inkOn = (accent: string) => {
  const l = luminance(accent);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#061019" : "#ffffff";
};

/** The accent as text over a dark picture: a dark brand colour is lightened to stay legible. */
export const readableAccent = (accent: string) =>
  luminance(accent) < 0.18
    ? `color-mix(in srgb, ${accent} 45%, white)`
    : accent;

/** The accent where the film draws it, each legible on what lies under it. */
export type AccentColours = {
  /** A fill: the call to action's pill. */
  fill: string;
  /** Text on that fill. */
  onFill: string;
  /** Text over the dark picture or caption box: the spoken karaoke word. */
  text: string;
  /** A soft glow under the fill, as rgba: alpha digits after a 3-digit hex are no colour. */
  glow: string;
};

export function accentColours(accent: string): AccentColours {
  const rgb = channels(accent) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((c) => Math.round(c * 255));
  return {
    fill: accent,
    onFill: inkOn(accent),
    text: readableAccent(accent),
    glow: `rgba(${r}, ${g}, ${b}, 0.33)`,
  };
}
