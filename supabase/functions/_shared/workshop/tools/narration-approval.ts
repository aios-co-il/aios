/**
 * How the user approves the narration take on the board (narration-review.ts): the tap question,
 * the payload keys that tie it to one take, and the reading of the user's answer, in the turn it
 * arrives (turn-answers.ts) and when produce_video runs.
 */

import { asRecord } from "../record.ts";
import { approvalAnswer, CHANGE_SCRIPT } from "../script-approval.ts";
import { NARRATION_LABEL } from "../tapped-answers.ts";
import type { ToolContext } from "../tool-context.ts";

export const APPROVE_NARRATION = "הקריינות מאושרת";
/** The tap question about the narration; "לתקן" is the same change answer as the script's. */
export const NARRATION_CHOICE = `[[בחירה: ${NARRATION_LABEL} | ${APPROVE_NARRATION} | ${CHANGE_SCRIPT}]]`;
const LISTEN =
  "האזינו לה: אם מילה נשמעת לא נכון, כתבו איזו מילה ואיך אומרים אותה, ואשמור את ההגייה לכל הסרטים הבאים בסדנה.";
export const NARRATION_QUESTION = `הקריינות מוכנה בלוח (עמוד "קריינות"). ${LISTEN}\n${NARRATION_CHOICE}`;
export const NARRATION_COMING = `הקריינות מוקלטת עכשיו ותופיע בלוח בעוד כחצי דקה (עמוד "קריינות"). ${LISTEN}\n${NARRATION_CHOICE}`;
/** payload.video: the voice run whose take the question is about, the turn it was asked in, the approved run. */
export const ASKED_RUN = "asked_narration_run";
export const ASKED_TURN = "asked_narration_turn";
export const APPROVED_RUN = "approved_narration_run";

/**
 * The user approved, in this turn, the take the question in Carmen's last message showed: a tap,
 * a bare approval word, or their words Carmen read as approval (narration_approved). Only for the
 * take the question was asked about, in an earlier turn, and never when they tapped "לתקן".
 */
export function narrationApprovedNow(
  ctx: Pick<ToolContext, "args" | "deps">,
  video: Record<string, unknown>,
  runId: string,
) {
  const answer = approvalAnswer(
    ctx.deps.lastAssistant ?? "",
    ctx.deps.userText ?? "",
    NARRATION_LABEL,
    APPROVE_NARRATION,
  );
  if (!answer.asked || answer.change || !askedEarlier(video, ctx.deps.turnId)) {
    return false;
  }
  return (
    video[ASKED_RUN] === runId &&
    (ctx.args.narration_approved === true || answer.approved)
  );
}

/**
 * The payload with the asked take approved when the user's message approves it (a tap or a bare
 * approval word). Saved before Carmen acts (turn-answers.ts), so a production call in a later turn
 * honors it even when she called another tool first; produce_video still checks it is the newest
 * current take.
 */
export function withTappedNarrationApproval(
  payload: Record<string, unknown>,
  turn: { lastAssistant: string; userText: string; turnId: string | null },
) {
  const video = asRecord(payload.video);
  const asked = video[ASKED_RUN];
  const answer = approvalAnswer(
    turn.lastAssistant,
    turn.userText,
    NARRATION_LABEL,
    APPROVE_NARRATION,
  );
  if (
    typeof asked !== "string" ||
    !answer.asked ||
    answer.change ||
    !answer.approved ||
    !askedEarlier(video, turn.turnId)
  ) {
    return payload;
  }
  return { ...payload, video: { ...video, [APPROVED_RUN]: asked } };
}

/** The question was asked in an earlier, known turn than this one. */
const askedEarlier = (
  video: Record<string, unknown>,
  turnId: string | null | undefined,
) => Boolean(turnId && video[ASKED_TURN] !== turnId);
