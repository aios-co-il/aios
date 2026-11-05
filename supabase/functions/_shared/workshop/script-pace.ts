/** How long a script's narration takes to say, so a beat's line fits its time (film-script.ts). */

/**
 * Hebrew voice-over pace, measured on the narration voice: a Staging film (5 Nov) scripted at 2.5
 * words a second spoke its 15 seconds in 17.7, and the scenes stretched to the take (the render
 * never cuts speech). A comma or a dash and the line's own end each add a pause (spokenSeconds).
 */
export const WORDS_PER_SECOND = 2;
const BREAK_PAUSE_S = 0.35;
const LINE_END_PAUSE_S = 0.3;

/** Words in a spoken line (punctuation alone is not a word). */
export const spokenWords = (text: string) =>
  text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;

/** The most words a beat of this length can say. */
export const maxWords = (seconds: number) =>
  Math.max(1, Math.floor(seconds * WORDS_PER_SECOND));

/**
 * How long the voice takes to say `text`, with its pauses: the words at WORDS_PER_SECOND, a pause
 * at each comma or dash inside the line, and one at its end. "שיווק, מכירות, לידים, תוכן, SEO."
 * took 5 seconds on Staging, not the 2 its five words suggest.
 */
export function spokenSeconds(text: string): number {
  const words = spokenWords(text);
  if (words === 0) {
    return 0;
  }
  const breaks = (
    text
      .trim()
      .replace(/[,;:\s]+$/u, "")
      .match(/[,;:—–]/gu) ?? []
  ).length;
  return words / WORDS_PER_SECOND + breaks * BREAK_PAUSE_S + LINE_END_PAUSE_S;
}
