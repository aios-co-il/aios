/**
 * Why workshop_save_script refuses a script as written: empty or too-short beats, lines the voice
 * cannot say in their time (script-pace.ts), beats that do not add up to the film, and a narration
 * too short for its beats (script-fill.ts).
 */

import type { ScriptBeat } from "../film-script.ts";
import {
  PACE_GUIDE,
  maxWords,
  spokenSeconds,
  spokenWords,
} from "../script-pace.ts";
import { fillRefusal } from "./script-fill.ts";

/** Rounding slack when the beats are compared with the film's length. */
const LENGTH_SLACK_S = 0.5;

/** Why the script cannot be saved as written, or null when it fits the film. */
export function beatsRefusal(beats: Array<ScriptBeat>, film: number | null) {
  if (beats.length === 0) {
    return "beats ריק: כל שורה בתסריט צריכה duration_s, narration או on_screen, ו-visual";
  }
  for (const [index, beat] of beats.entries()) {
    // Rounded like the times, so 0.1-second steps don't leave 2.9999 behind.
    const length = Math.round((beat.end_s - beat.start_s) * 10) / 10;
    if (length < 0.5) {
      return `שורה ${index + 1}: duration_s חייב להיות לפחות 0.5 שניות.`;
    }
    if (!beat.narration && !beat.on_screen) {
      return `שורה ${index + 1}: חסרים narration ו-on_screen.`;
    }
  }
  const tooLong = paceRefusal(beats);
  if (tooLong) {
    return tooLong;
  }
  const total = beats[beats.length - 1].end_s;
  if (film && Math.abs(total - film) > LENGTH_SLACK_S) {
    return `סכום השורות ${total} שניות, והסרט ${film} שניות. התאימי את duration_s כך שהסכום יהיה ${film}. אם המשתמש שינה את אורך הסרט, עדכני אותו קודם ב-workshop_storyboard עם brief_answers {"אורך": "<האורך החדש>"}.`;
  }
  return fillRefusal(beats);
}

/**
 * Every line the voice cannot say in its beat, with the most words that fit it, so Carmen fixes
 * them in one go; null when all fit. Uses maxWords, the limit PACE_GUIDE states to her: a longer
 * line stretches the film past its length (the render never cuts speech).
 */
function paceRefusal(beats: Array<ScriptBeat>) {
  const lines = beats.flatMap((beat, index) => {
    const length = Math.round((beat.end_s - beat.start_s) * 10) / 10;
    const words = spokenWords(beat.narration);
    const fits = maxWords(length, beat.narration);
    if (words <= fits) {
      return [];
    }
    const said = Math.round(spokenSeconds(beat.narration) * 10) / 10;
    return [
      `שורה ${index + 1}: ${words} מילים נאמרות בכ-${said} שניות, וב-${length} שניות נכנסות עד ${fits}`,
    ];
  });
  if (lines.length === 0) {
    return null;
  }
  return `הקריינות ארוכה מהזמן של השורה: ${lines.join("; ")}. ${PACE_GUIDE} קצרי כל שורה כזו עד מספר המילים שלה או הוסיפי לה זמן, אחרת הסרט יוצא ארוך מהמתוכנן.`;
}
