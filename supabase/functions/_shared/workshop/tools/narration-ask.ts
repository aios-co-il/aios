/**
 * What produce_video stops with while the narration waits for the user (narration-review.ts): it
 * waits for the take it queued and asks about it, says why a recording failed, and saves which
 * take the message was about so the user's answer approves only that take.
 */

import { savePayload } from "../project-io.ts";
import { asRecord } from "../record.ts";
import type { ToolContext } from "../tool-context.ts";
import {
  ASKED_RUN,
  ASKED_SHOWN,
  ASKED_TURN,
  ASKED_WHEN_READY,
  NARRATION_COMING,
  NARRATION_QUESTION,
} from "./narration-approval.ts";
import { waitForTake } from "./narration-take-state.ts";
import { RECORDED_GUIDE } from "./narration-take.ts";

export type ReviewContext = Pick<
  ToolContext,
  "supabase" | "tenantId" | "args" | "deps"
>;

const CARMEN_NEXT =
  'הקריינות מחכה לאישור המשתמש (מצב חצי אוטומטי). say_to_user נשלח למשתמש כמו שהוא; עצרי. אישר (בכפתור, או במילים כמו "מאשר"): קראי שוב ל-workshop_produce_video, ובאישור במילים עם narration_approved=true. מילה נשמעת לא נכון: workshop_save_pronunciation ואז workshop_produce_video, שמקליט מחדש. ביקש הקלטה חדשה בלי תיקון: workshop_produce_video עם redo_narration=true. קשה לו להסביר מה לא נשמע נכון: הציעי להקליט את הקריינות בקול שלו בכפתור "הקלטה בקול שלי" בעמוד הקריינות; כשההודעה שלו מתחילה ב-"הקלטתי את הקריינות בקול שלי:", קראי ל-workshop_produce_video (הקול מוחלף לקול הנבחר, והתוצאה נשאלת שוב).';

/**
 * Waits for the voice run `runId` and asks about its take once it is on the board, or says why it
 * failed. When the wait runs out it stops with NARRATION_COMING, and the user's reply once the take
 * appears is the answer (narrationApprovedNow).
 */
export async function awaitTake(
  ctx: ReviewContext,
  itemId: string,
  payload: Record<string, unknown>,
  runId: string,
) {
  const settled = await waitForTake(
    ctx.supabase,
    itemId,
    runId,
    ctx.deps.sleep,
  );
  if (settled && "error" in settled) {
    return { stop: { error: settled.error } };
  }
  if (settled?.ready && settled.run_id === runId) {
    return await askAbout(ctx, itemId, payload, runId, NARRATION_QUESTION);
  }
  if (settled?.last_run_status === "failed" && settled.last_run_id === runId) {
    await saveAsked(ctx, itemId, payload, runId, null);
    return {
      stop: failedStop(settled.last_run_error, asRecord(payload.video)),
    };
  }
  return await askAbout(ctx, itemId, payload, runId, NARRATION_COMING);
}

/** Records which take the question shows and the turn it is asked in, and stops with it. */
export async function askAbout(
  ctx: ReviewContext,
  itemId: string,
  payload: Record<string, unknown>,
  runId: string,
  question: string,
) {
  await saveAsked(ctx, itemId, payload, runId, question);
  return {
    stop: {
      needs_input: true,
      missing: ["narration"],
      ...(question === NARRATION_COMING ? { narration: "recording" } : {}),
      say_to_user: question,
      carmen_next: CARMEN_NEXT,
    },
  };
}

/**
 * Saves the voice run the last narration message was about, its turn, and which message it was;
 * `null` for a failed recording, which no answer can approve.
 */
async function saveAsked(
  ctx: ReviewContext,
  itemId: string,
  payload: Record<string, unknown>,
  runId: string,
  question: string | null,
) {
  const video = asRecord(payload.video);
  await savePayload(ctx.supabase, ctx.tenantId, itemId, {
    ...payload,
    video: {
      ...video,
      [ASKED_RUN]: runId,
      [ASKED_TURN]: ctx.deps.turnId ?? null,
      [ASKED_SHOWN]: question === NARRATION_QUESTION,
      [ASKED_WHEN_READY]: question === NARRATION_COMING,
    },
  });
}

/**
 * What produce_video answers when the narration recording failed: say why, record again only on
 * request. A failed voice change of the user's own recording (RECORDED_GUIDE) is retried from the
 * same recording (narration-guide-step.ts retriedGuide), or they record again on the board.
 */
export function failedStop(
  error: string | null,
  video: Record<string, unknown>,
) {
  const guide = typeof video[RECORDED_GUIDE] === "string";
  return {
    needs_input: true,
    missing: ["narration"],
    narration: "failed",
    error: error ?? (guide ? GUIDE_FAILED : "הקלטת הקריינות נכשלה"),
    carmen_next: guide ? GUIDE_FAILED_NEXT : FAILED_NEXT,
  };
}

const FAILED_NEXT =
  "הקלטת הקריינות נכשלה. אמרי למשתמש במשפט אחד למה (error) ושאלי אם לנסות שוב. רק אם ביקש: workshop_produce_video עם redo_narration=true.";
const GUIDE_FAILED = "החלפת הקול בהקלטה שלך נכשלה";
const GUIDE_FAILED_NEXT =
  'החלפת הקול בהקלטה של המשתמש נכשלה. אמרי לו במשפט אחד למה (error) ושאלי אם לנסות שוב עם אותה הקלטה, או להקליט מחדש בכפתור "הקלטה בקול שלי" בעמוד הקריינות. רק אם ביקש לנסות שוב: workshop_produce_video עם redo_narration=true (אותה הקלטה). הקליט מחדש: ההודעה החדשה שלו מביאה נתיב חדש, קראי ל-workshop_produce_video.';
