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
/**
 * The take was still recording when produce_video stopped waiting for it (narration-review.ts).
 * No approval tap: a tap now would approve a take the user has not heard. Their reply once it is
 * on the board approves that take (narrationApprovedNow), so nothing waits on a callback.
 */
export const NARRATION_COMING = `הקריינות עדיין מוקלטת ותופיע בלוח בעוד רגע (עמוד "קריינות"). כשתופיע, האזינו לה וכתבו "${APPROVE_NARRATION}", או איזו מילה לתקן ואיך אומרים אותה.`;
/**
 * payload.video: the voice run the last narration message was about, the turn it was sent in,
 * whether that take was on the board (NARRATION_QUESTION), whether the user was told to answer
 * once it appears (NARRATION_COMING), the approved run.
 */
export const ASKED_RUN = "asked_narration_run";
export const ASKED_TURN = "asked_narration_turn";
export const ASKED_SHOWN = "asked_narration_shown";
export const ASKED_WHEN_READY = "asked_narration_when_ready";
export const APPROVED_RUN = "approved_narration_run";

/**
 * The user approved, in this turn, the take Carmen's last narration message was about: a tap, a
 * bare approval word, or their words Carmen read as approval (narration_approved). Only for that
 * take, asked in an earlier turn, and never when they tapped "לתקן". The question showed the take
 * on the board; after NARRATION_COMING the caller passes only the finished take that message was
 * about (reviewTake), so the user's reply once it appeared counts the same way.
 */
export function narrationApprovedNow(
  ctx: Pick<ToolContext, "args" | "deps">,
  video: Record<string, unknown>,
  runId: string,
) {
  const userText = ctx.deps.userText ?? "";
  const answer = approvalAnswer(
    ctx.deps.lastAssistant ?? "",
    userText,
    NARRATION_LABEL,
    APPROVE_NARRATION,
  );
  if (
    answer.change ||
    userText.trim() === "" ||
    userText.trim() === CHANGE_SCRIPT ||
    !askedEarlier(video, ctx.deps.turnId) ||
    video[ASKED_RUN] !== runId
  ) {
    return false;
  }
  const answerable =
    (video[ASKED_SHOWN] === true && answer.asked) ||
    video[ASKED_WHEN_READY] === true;
  return (
    answerable && (ctx.args.narration_approved === true || answer.approved)
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
    !askedEarlier(video, turn.turnId) ||
    video[ASKED_SHOWN] !== true
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
