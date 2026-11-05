/**
 * When workshop_save_script stops before saving a page. On Staging (5 Nov) Carmen saved a script
 * on the user's first message with no concept chosen, and re-saved the script in the turn the user
 * approved it, which stored a new unapproved copy and showed the user the same script again.
 */

import { briefAnswersOf } from "../brief-answers.ts";
import {
  CONCEPT_LABEL,
  conceptAnswer,
  filmScriptOf,
  scriptText,
  type ScriptBeat,
} from "../film-script.ts";
import { approvesScript } from "../script-approval.ts";
import type { WorkshopDeps } from "../gate.ts";

/**
 * The reply that stands in for saving, or null when the script may be saved: no concept chosen
 * yet, the stored script again, or a rewrite of the script the user approved in this very turn.
 */
export function scriptSaveStop(
  payload: Record<string, unknown>,
  beats: Array<ScriptBeat>,
  deps: Pick<WorkshopDeps, "turnId" | "userText">,
) {
  // The NO_CONCEPT answer (film-concept.ts) is the user's explicit skip, and counts as chosen.
  if (!conceptAnswer(briefAnswersOf(payload))) {
    return CONCEPT_FIRST;
  }
  const stored = filmScriptOf(payload);
  if (!stored || "skipped" in stored) {
    return null;
  }
  if (sameBeats(stored.beats, beats)) {
    return stored.approved ? ALREADY_APPROVED : alreadyWaiting(stored);
  }
  const approvedNow = Boolean(
    deps.turnId && stored.approved && stored.approved_turn === deps.turnId,
  );
  // A clean approval is all the user said; a message that also asks for changes may be written.
  return approvedNow && approvesScript(deps.userText ?? "")
    ? APPROVED_THIS_TURN
    : null;
}

/** Same lines, on-screen text and timing: saving again would only drop the user's approval. */
function sameBeats(stored: Array<ScriptBeat>, beats: Array<ScriptBeat>) {
  return (
    stored.length === beats.length &&
    stored.every(
      (beat, index) =>
        beat.start_s === beats[index].start_s &&
        beat.end_s === beats[index].end_s &&
        beat.narration === beats[index].narration &&
        beat.on_screen === beats[index].on_screen,
    )
  );
}

// say_to_user stays empty: a non-empty one ends the turn before Carmen can write the concepts.
const CONCEPT_FIRST = {
  needs_input: true,
  missing: ["concept"],
  say_to_user: "",
  carmen_next: `עוד לא כותבים תסריט: קודם קונספט שהמשתמש בחר. כתבי 2 עד 3 קונספטים לפי הבריף ושמרי ב-workshop_save_concepts (מה שכבר בלוח לא שומרים שוב), הציגי אותם בקצרה וסיימי בשורה [[בחירה: ${CONCEPT_LABEL} | <שם 1> | <שם 2> | <שם 3>]]. ואז עצרי עד שהמשתמש בוחר.`,
};

const ALREADY_APPROVED = {
  success: true,
  already_saved: true,
  approved: true,
  say_to_user: "",
  carmen_next:
    "התסריט הזה כבר שמור והמשתמש אישר אותו; לא שומרים אותו שוב. הצעד הבא: workshop_storyboard, סצנה אחת לכל שורה בתסריט.",
};

const APPROVED_THIS_TURN = {
  error:
    "המשתמש אישר את התסריט בהודעה הזו, ולא כותבים אותו מחדש באותו תור. המשיכי ל-workshop_storyboard, סצנה אחת לכל שורה בתסריט שאושר.",
};

/** The same script is already on the board, waiting for the user; nothing new is saved. */
function alreadyWaiting(stored: { title: string; beats: Array<ScriptBeat> }) {
  return {
    success: true,
    already_saved: true,
    approved: false,
    say_to_user: "",
    script: scriptText(stored),
    carmen_next:
      "התסריט הזה כבר שמור ומחכה לאישור המשתמש; לא שומרים אותו שוב. אישר במילים בהודעה הזו: workshop_storyboard עם script_approved=true. אחרת עצרי וחכי לתשובה שלו.",
  };
}
