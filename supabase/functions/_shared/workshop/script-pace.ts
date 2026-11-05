/** How long a script's narration takes to say, so a beat's line fits its time (film-script.ts). */

/**
 * Hebrew voice-over pace, measured on the narration voice: a Staging film (5 Nov) scripted at 2.5
 * words a second spoke its 15 seconds in 17.7, and the scenes stretched to the take (the render
 * never cuts speech). Each pause inside the line and the line's own end add a pause (pauses).
 */
export const WORDS_PER_SECOND = 2;
const BREAK_PAUSE_S = 0.35;
const LINE_END_PAUSE_S = 0.3;

/**
 * A pause inside a line: a comma, semicolon, colon or dash, a sentence end followed by more words
 * (". ! ? …"), or a hyphen with spaces around it. A hyphen inside a word ("ה-8") or a decimal
 * point ("3.5") is no pause.
 */
const PAUSE = /[,;:—–]|[.!?…]+(?=\s)|\s-(?=\s)/gu;

/**
 * The least of its time the narration must fill. The edit cuts the scenes to the take, so a short
 * narration makes a short film: a 15-second brief scripted at 11 seconds of speech came out 13.2
 * (Staging, 5 Nov). The save tool refuses a script whose narration says less (tools/script-fill.ts).
 */
export const MIN_FILL = 0.85;
/** Words a beat may stay under its maxWords (PACE_GUIDE asks for each beat to come this close). */
export const FILL_SLACK_WORDS = 1;

/** How the pace is stated to Carmen: the same rules maxWords and MIN_FILL check (the save tool refuses past them). */
export const PACE_GUIDE = `בכל שורה עד (השניות פחות ${LINE_END_PAUSE_S}) כפול ${WORDS_PER_SECOND} מילים, וכל פסיק, נקודה, סימן שאלה או מקף בתוך השורה מוריד עוד ${BREAK_PAUSE_S} שניות (שורה של 2.5 שניות: עד ${maxWords(2.5)} מילים; 3 שניות: עד ${maxWords(3)}; 5 שניות: עד ${maxWords(5)}). רשימה של מילים עם פסיקים ארוכה בקול ממה שנראה. ומלאי כל שורה כמעט עד המקסימום שלה (לכל היותר מילה אחת פחות): הסרט נחתך לפי הקריינות, וקריינות קצרה יוצרת סרט קצר מהמתוכנן. קריינות שנאמרת בפחות מ-${Math.round(MIN_FILL * 100)}% מזמן השורות שלה לא תישמר.`;

/** Words in a spoken line (punctuation alone is not a word). */
export const spokenWords = (text: string) =>
  text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;

/**
 * The most words a beat of this length can say with the pauses `text` has inside it (none for a
 * line not written yet): what is left of the beat after its pauses, at WORDS_PER_SECOND.
 */
export function maxWords(seconds: number, text = ""): number {
  // The epsilon keeps a float like (3.3 - 0.3) * 2 = 5.999… from losing a whole word.
  const room = (seconds - pausesSeconds(text)) * WORDS_PER_SECOND + 1e-6;
  return Math.max(0, Math.floor(room));
}

/**
 * How long the voice takes to say `text`, with its pauses. "שיווק, מכירות, לידים, תוכן, SEO."
 * took 5 seconds on Staging, not the 2 its five words suggest.
 */
export function spokenSeconds(text: string): number {
  const words = spokenWords(text);
  if (words === 0) {
    return 0;
  }
  return words / WORDS_PER_SECOND + pausesSeconds(text);
}

/** The pauses in a line: one at each pause inside it (PAUSE) and one at its end. */
function pausesSeconds(text: string): number {
  const inner = text.trim().replace(/[\s,;:.!?…—–-]+$/u, "");
  return (inner.match(PAUSE) ?? []).length * BREAK_PAUSE_S + LINE_END_PAUSE_S;
}
