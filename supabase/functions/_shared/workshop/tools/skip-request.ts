/**
 * Whether the user asked in this turn to skip the concepts or the script. Carmen's skip_concepts
 * and skip_script went through unchecked, so she could pass over the user's choice of concept and
 * approval of the script just as she passed her own concept (concept-choice.ts). A skip counts
 * when the user's message asks for it in words, or is itself a full script.
 */

import { maxWords, spokenWords } from "../film-script.ts";

/** The step Carmen asks to skip. */
export type SkippedStep = "concepts" | "script";

const ASKED: Record<SkippedStep, RegExp> = {
  concepts: /בלי\s+קונספט|ישר\s+ל(?:סצנות|הפקה)/,
  script: /בלי\s+תסריט|ישר\s+ל(?:סצנות|הפקה)/,
};
/** A script of the user's own: lines of a film, not a one-line request. */
const SCRIPT_LINES = 3;
const SCRIPT_WORDS = 15;

/**
 * The skip is the user's: asked for in this message, or the message is a full script (several
 * lines, or enough spoken words to fill the film).
 */
export function skipAskedByUser(
  step: SkippedStep,
  userText: string,
  filmSeconds: number | null,
) {
  const text = String(userText ?? "");
  return ASKED[step].test(text) || isOwnScript(text, filmSeconds);
}

/** The message is a script of its own: several lines of text, or long enough for the film. */
function isOwnScript(text: string, filmSeconds: number | null) {
  const words = spokenWords(text);
  const lines = text.split("\n").filter((line) => spokenWords(line) > 0);
  const fillsFilm = filmSeconds !== null && words >= maxWords(filmSeconds);
  return (
    (lines.length >= SCRIPT_LINES && words >= SCRIPT_WORDS) ||
    (fillsFilm && words >= SCRIPT_WORDS)
  );
}

/** What Carmen is told when she skipped a step the user did not ask to skip. */
export const skipRefused = (step: SkippedStep) =>
  step === "concepts"
    ? 'skip_concepts לא נשמר: המשתמש לא ביקש בהודעה הזו לוותר על הקונספטים ולא נתן תסריט מלא משלו. ממשיכים בשלב הקונספט כמו שכתוב כאן. אם המשתמש רוצה לדלג, שיכתוב "בלי קונספט, ישר לסצנות" או ישלח את התסריט שלו.'
    : 'skip_script לא נשמר: המשתמש לא ביקש בהודעה הזו לוותר על התסריט ולא נתן תסריט מלא משלו. ממשיכים בשלב התסריט כמו שכתוב כאן. אם המשתמש רוצה לדלג, שיכתוב "בלי תסריט, ישר לסצנות" או ישלח את התסריט שלו.';
