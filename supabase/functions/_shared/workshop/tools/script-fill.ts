/**
 * The other side of the pace limit (script-pace.ts): a narration that says too little. The edit
 * cuts the scenes to the narration's take, so a script whose lines stop well short of their beats
 * makes a film shorter than the brief (Staging, 5 Nov: 15 seconds asked, 13.2 made).
 */

import type { ScriptBeat } from "../film-script.ts";
import {
  MIN_FILL,
  PACE_GUIDE,
  WORDS_PER_SECOND,
  maxWords,
  pausesSeconds,
  spokenSeconds,
  spokenWords,
} from "../script-pace.ts";

/**
 * Why the narration is too short for its beats, with every narrated beat that can take more words
 * and how many, or null when it fills at least MIN_FILL of what its beats can hold. A beat holds
 * maxWords whole words plus its pauses, not its full length (a 2.2-second beat holds 3 words, 1.8
 * seconds), so MIN_FILL can always be reached by adding words and a script filled to its maxWords
 * always saves. The refusal lists every beat with room for even one more word: a word short in each
 * of five 3-second beats is 4 of 5 words everywhere, about 82%. Beats without narration (an
 * on-screen-only beat) are left out of both sides.
 */
export function fillRefusal(beats: Array<ScriptBeat>): string | null {
  const narrated = beats
    .map((beat, index) => ({
      index,
      words: spokenWords(beat.narration),
      fits: maxWords(beatLength(beat), beat.narration),
      narration: beat.narration,
    }))
    .filter(({ words }) => words > 0);
  const holds = narrated.reduce(
    (sum, { fits, narration }) => sum + achievableSeconds(fits, narration),
    0,
  );
  const spoken = narrated.reduce(
    (sum, { narration }) => sum + spokenSeconds(narration),
    0,
  );
  const room = narrated.flatMap(({ index, words, fits }) =>
    fits > words
      ? [`שורה ${index + 1}: ${words} מילים, ונכנסות עד ${fits}`]
      : [],
  );
  // No room means every beat is at its maxWords, so the fill is already whole.
  if (spoken >= holds * MIN_FILL || room.length === 0) {
    return null;
  }
  const percent = Math.round((spoken / holds) * 100);
  return `הקריינות קצרה מדי: נאמרת בכ-${round(spoken)} שניות מתוך כ-${round(holds)} שהשורות שלה יכולות להכיל (${percent}%, צריך לפחות ${Math.round(MIN_FILL * 100)}%), והסרט ייצא קצר מהמתוכנן. הוסיפי מילים: ${room.join("; ")}. ${PACE_GUIDE}`;
}

/** How long a beat's line takes when it says the most words that fit it (fits), with its pauses. */
const achievableSeconds = (fits: number, narration: string) =>
  fits / WORDS_PER_SECOND + pausesSeconds(narration);

/** A beat's length, rounded like the times so 0.1-second steps don't leave 2.9999 behind. */
const beatLength = (beat: ScriptBeat) =>
  Math.round((beat.end_s - beat.start_s) * 10) / 10;

const round = (seconds: number) => Math.round(seconds * 10) / 10;
