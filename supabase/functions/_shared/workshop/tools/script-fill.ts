/**
 * The other side of the pace limit (script-pace.ts): a narration that says too little. The edit
 * cuts the scenes to the narration's take, so a script whose lines stop well short of their beats
 * makes a film shorter than the brief (Staging, 5 Nov: 15 seconds asked, 13.2 made).
 */

import type { ScriptBeat } from "../film-script.ts";
import {
  FILL_SLACK_WORDS,
  MIN_FILL,
  PACE_GUIDE,
  maxWords,
  spokenSeconds,
  spokenWords,
} from "../script-pace.ts";

/**
 * Why the narration is too short for its beats, with every narrated beat that can take more words
 * and how many, or null when it fills at least MIN_FILL of their time. Beats without narration (an
 * on-screen-only beat) are left out of both sides.
 */
export function fillRefusal(beats: Array<ScriptBeat>): string | null {
  const narrated = beats
    .map((beat, index) => ({ beat, index, length: beatLength(beat) }))
    .filter(({ beat }) => spokenWords(beat.narration) > 0);
  if (narrated.length === 0) {
    return null;
  }
  const planned = narrated.reduce((sum, { length }) => sum + length, 0);
  const spoken = narrated.reduce(
    (sum, { beat }) => sum + spokenSeconds(beat.narration),
    0,
  );
  if (spoken >= planned * MIN_FILL) {
    return null;
  }
  const room = narrated.flatMap(({ beat, index, length }) => {
    const words = spokenWords(beat.narration);
    const fits = maxWords(length, beat.narration);
    return fits - words > FILL_SLACK_WORDS
      ? [`שורה ${index + 1}: ${words} מילים, ונכנסות עד ${fits}`]
      : [];
  });
  const said = round(spoken);
  const percent = Math.round((spoken / planned) * 100);
  return `הקריינות קצרה מדי: נאמרת בכ-${said} שניות מתוך ${round(planned)} (${percent}%, צריך לפחות ${Math.round(MIN_FILL * 100)}%), והסרט ייצא קצר מהמתוכנן. ${room.length > 0 ? `הוסיפי מילים: ${room.join("; ")}.` : "קצרי את duration_s של השורות או הוסיפי שורה."} ${PACE_GUIDE}`;
}

/** A beat's length, rounded like the times so 0.1-second steps don't leave 2.9999 behind. */
const beatLength = (beat: ScriptBeat) =>
  Math.round((beat.end_s - beat.start_s) * 10) / 10;

const round = (seconds: number) => Math.round(seconds * 10) / 10;
