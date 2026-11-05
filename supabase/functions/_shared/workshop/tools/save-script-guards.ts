/**
 * When workshop_save_script stops before saving a page. On Staging (5 Nov) Carmen saved a script
 * on the user's first message with no concept chosen, and re-saved the script in the turn the user
 * approved it, which stored a new unapproved copy and showed the user the same script again.
 */

import { briefAnswersOf } from "../brief-answers.ts";
import {
  conceptAnswer,
  filmScriptOf,
  scriptText,
  type FilmScript,
  type ScriptBeat,
} from "../film-script.ts";
import type { WorkshopDeps } from "../gate.ts";
import { cleanScriptApproval, SCRIPT_CHOICE } from "../script-approval.ts";

/**
 * The reply that stands in for saving, or null when the script may be saved: no concept chosen
 * yet, the stored script again, or a rewrite of the script the user approved in this very turn.
 */
export function scriptSaveStop(
  payload: Record<string, unknown>,
  beats: Array<ScriptBeat>,
  deps: Pick<WorkshopDeps, "turnId" | "userText" | "lastAssistant">,
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
    return stored.approved
      ? ALREADY_APPROVED
      : alreadyWaiting(stored, deps.turnId ?? null);
  }
  const approvedNow = Boolean(
    deps.turnId && stored.approved && stored.approved_turn === deps.turnId,
  );
  // A clean approval is all the user said; a message that also asks for changes may be written.
  const clean = cleanScriptApproval(
    deps.lastAssistant ?? "",
    deps.userText ?? "",
  );
  return approvedNow && clean ? APPROVED_THIS_TURN : null;
}

/** The same beats as stored: saving them again would only drop the user's approval. */
function sameBeats(stored: Array<ScriptBeat>, beats: Array<ScriptBeat>) {
  return (
    stored.length === beats.length &&
    stored.every(
      (beat, index) =>
        beat.start_s === beats[index].start_s &&
        beat.end_s === beats[index].end_s &&
        beat.narration === beats[index].narration &&
        beat.on_screen === beats[index].on_screen &&
        beat.visual === beats[index].visual,
    )
  );
}

// The concept step lives in workshop_storyboard (film-concept.ts): it reads a choice in words,
// the user's skip, or asks for concepts. say_to_user stays empty so Carmen can call it now.
const CONCEPT_FIRST = {
  needs_input: true,
  missing: ["concept"],
  say_to_user: "",
  carmen_next:
    "עוד לא כותבים תסריט: קודם קונספט שהמשתמש בחר. קראי ל-workshop_storyboard: המשתמש בחר במילים → concept=<הבחירה>; נתן תסריט מלא משלו או ביקש בלי קונספטים → skip_concepts=true; אחרת בלי פרמטרים, והכלי יבקש קונספטים.",
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

/**
 * The same script is already on the board, waiting for the user; nothing new is saved. Saved in
 * an earlier turn, it is shown again with the approval buttons; in this turn it already was.
 */
function alreadyWaiting(stored: FilmScript, turnId: string | null) {
  const text = scriptText(stored);
  const shownEarlier = stored.saved_turn !== turnId;
  return {
    success: true,
    already_saved: true,
    approved: false,
    say_to_user: shownEarlier ? `${text}\n\n${SCRIPT_CHOICE}` : "",
    script: text,
    carmen_next: shownEarlier
      ? "התסריט הזה כבר שמור; הוא הוצג שוב למשתמש עם כפתורי האישור. עצרי."
      : "התסריט הזה כבר שמור ומחכה לאישור המשתמש; לא שומרים אותו שוב. עצרי וחכי לתשובה שלו.",
  };
}
