/**
 * The timing of a scene's on-screen text drawn as motion graphics in a film without spoken
 * captions (workshop-motion-title.tsx). With no narration there are no word timings, so the
 * words enter one after another from the scene's start and the text leaves before its end.
 */

/** Frames before the first word, between words, and for the text to leave. */
export const TITLE_DELAY = 6;
export const TITLE_STAGGER = 4;
export const TITLE_EXIT = 8;

export type TitleWord = {
  text: string;
  /** Scene frame at which the word starts entering. */
  at: number;
  /** A number, price or date (20%, 31.12.26): drawn in the accent colour. */
  key: boolean;
};

const HAS_DIGIT = /\d/;

/**
 * The words of `text` with their entrance frames, fitted into a scene `frames` long: the
 * stagger shrinks so the last word is in before the text starts to leave.
 */
export function motionTitleWords(text: string, frames: number): TitleWord[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const room = Math.max(0, frames - TITLE_DELAY - TITLE_EXIT - 12);
  const stagger =
    words.length > 1 ? Math.min(TITLE_STAGGER, room / (words.length - 1)) : 0;
  return words.map((word, index) => ({
    text: word,
    at: Math.round(TITLE_DELAY + index * stagger),
    key: HAS_DIGIT.test(word),
  }));
}
