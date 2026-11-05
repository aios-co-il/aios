/**
 * How the user approves a film's script: a tap on the question that ends the script, read from
 * Carmen's last message and the user's reply. Only a clean approval counts; "מאושר אבל תחליפי
 * שורה 2" is a change request.
 */

import { isExplicitApprovalPhrase } from "../wa-approval-flow.ts";
import { withScriptApproved } from "./film-script.ts";
import { answersTo, askedChoices, isScriptLabel } from "./tapped-answers.ts";

export const SCRIPT_LABEL = "התסריט";
export const APPROVE_SCRIPT = "התסריט מאושר";
export const CHANGE_SCRIPT = "לתקן";
/** The tap question that ends every script Carmen shows (save-script.ts sends it). */
export const SCRIPT_CHOICE = `[[בחירה: ${SCRIPT_LABEL} | ${APPROVE_SCRIPT} | ${CHANGE_SCRIPT}]]`;

/** The user tapped approval on Carmen's script question in this turn ("לתקן" is not one). */
export function scriptApprovedByTap(lastAssistant: string, userText: string) {
  const asked = askedChoices(lastAssistant).filter((choice) =>
    isScriptLabel(choice.label),
  );
  return Object.values(answersTo(asked, userText)).some(approves);
}

/** The approve button itself, or a bare approval word with nothing after it. */
function approves(answer: string) {
  const text = answer.trim();
  return (
    text === APPROVE_SCRIPT ||
    /^(מאשר|מאשרת|מאשרים|מאושר)[\s.!]*$/.test(text) ||
    isExplicitApprovalPhrase(text)
  );
}

/** The payload with the stored script approved when the user tapped approval in this turn. */
export function withTappedScriptApproval(
  payload: Record<string, unknown>,
  turn: { lastAssistant: string; userText: string },
) {
  return scriptApprovedByTap(turn.lastAssistant, turn.userText)
    ? withScriptApproved(payload)
    : payload;
}
