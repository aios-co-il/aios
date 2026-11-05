/**
 * Semi-automatic mode: the user hears the narration before anything is animated. Dicta's nikud
 * still left words said wrong (Staging, 5 Nov: "מכירות" came out "מחירות"), and a wrong word was
 * only heard in the finished film, after every clip was paid for. Once the voice is chosen,
 * produce_video records the narration alone (narration-take.ts), the take lands on the board as a
 * "קריינות" page, and production waits for the user's approval of that take. Corrections are
 * tenant-wide pronunciations (save-pronunciation.ts); a changed one, a new script or a new voice
 * records the narration again. The approved take is the film's narration: produce_video queues
 * no voice run while video_narration_ready holds.
 */

import { savePayload } from "../project-io.ts";
import { asRecord } from "../record.ts";
import type { ToolContext } from "../tool-context.ts";
import { isAutoMode } from "../workshop-mode.ts";
import {
  APPROVED_RUN,
  ASKED_RUN,
  ASKED_TURN,
  NARRATION_COMING,
  NARRATION_QUESTION,
  narrationApprovedNow,
} from "./narration-approval.ts";
import {
  loadTake,
  recordNarration,
  type NarrationPlan,
  type NarrationTake,
} from "./narration-take.ts";

const CARMEN_NEXT =
  'הקריינות מחכה לאישור המשתמש (מצב חצי אוטומטי). say_to_user נשלח למשתמש כמו שהוא; עצרי. אישר (בכפתור, או במילים כמו "מאשר"): קראי שוב ל-workshop_produce_video, ובאישור במילים עם narration_approved=true. מילה נשמעת לא נכון: workshop_save_pronunciation ואז workshop_produce_video, שמקליט מחדש. ביקש הקלטה חדשה בלי תיקון: workshop_produce_video עם redo_narration=true.';

type ReviewContext = Pick<
  ToolContext,
  "supabase" | "tenantId" | "args" | "deps"
>;

/**
 * Before produce_video quotes the film: the payload when the narration is approved (or needs no
 * review), else `stop` with what Carmen tells the user: the take is being recorded, the question
 * about a take on the board, or why the last recording failed. Automatic mode, a film with no
 * narration and a talking film (narrated scene by scene, nothing on the board to hear) pass, and so
 * does a project whose take cannot be read (logged): the review never blocks production by itself.
 */
export async function narrationStep(
  ctx: ReviewContext,
  itemId: string,
  payload: Record<string, unknown>,
  plan: NarrationPlan,
): Promise<
  { stop: Record<string, unknown> } | { payload: Record<string, unknown> }
> {
  if (isAutoMode(payload) || !plan.narrated) {
    return { payload };
  }
  const take = await loadTake(ctx.supabase, itemId);
  if (!take || take.talking) {
    return { payload };
  }
  const video = asRecord(payload.video);
  if (take.in_flight) {
    return await askAbout(
      ctx,
      itemId,
      payload,
      take.last_run_id,
      NARRATION_COMING,
    );
  }
  if (isFresh(take, ctx.args) && !plan.newVoice) {
    return await reviewTake(ctx, itemId, payload, take.run_id);
  }
  if (lastRecordingFailed(take, video) && ctx.args.redo_narration !== true) {
    return { stop: failedStop(take.last_run_error) };
  }
  const recorded = await recordNarration(ctx, itemId, payload, plan);
  if ("error" in recorded || "stop" in recorded) {
    return { stop: "stop" in recorded ? recorded.stop : recorded };
  }
  return await askAbout(
    ctx,
    itemId,
    recorded.payload,
    recorded.runId,
    NARRATION_COMING,
  );
}

/**
 * The take is current: approved already, approved by the user now, or asked about (again). The
 * approval is saved on the payload so a later production call does not ask again.
 */
async function reviewTake(
  ctx: ReviewContext,
  itemId: string,
  payload: Record<string, unknown>,
  runId: string,
) {
  const video = asRecord(payload.video);
  if (video[APPROVED_RUN] === runId) {
    return { payload };
  }
  if (!narrationApprovedNow(ctx, video, runId)) {
    return await askAbout(ctx, itemId, payload, runId, NARRATION_QUESTION);
  }
  const next = { ...payload, video: { ...video, [APPROVED_RUN]: runId } };
  await savePayload(ctx.supabase, ctx.tenantId, itemId, next);
  return { payload: next };
}

/** Records which take the question shows and the turn it is asked in, and stops with it. */
async function askAbout(
  ctx: ReviewContext,
  itemId: string,
  payload: Record<string, unknown>,
  runId: string | null,
  question: string,
) {
  const video = asRecord(payload.video);
  await savePayload(ctx.supabase, ctx.tenantId, itemId, {
    ...payload,
    video: {
      ...video,
      [ASKED_RUN]: runId,
      [ASKED_TURN]: ctx.deps.turnId ?? null,
    },
  });
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

/** The newest take reads the current script in the project's voice and current pronunciations. */
const isFresh = (
  take: NarrationTake,
  args: Record<string, unknown>,
): take is NarrationTake & { run_id: string } =>
  take.ready &&
  !take.pronunciations_changed &&
  typeof take.run_id === "string" &&
  args.redo_narration !== true;

/** The recording the user was told about failed, and no newer take replaced it. */
const lastRecordingFailed = (
  take: NarrationTake,
  video: Record<string, unknown>,
) => take.last_run_status === "failed" && take.last_run_id === video[ASKED_RUN];

/** What produce_video answers when the narration recording failed: say why, record again only on request. */
const failedStop = (error: string | null) => ({
  needs_input: true,
  missing: ["narration"],
  narration: "failed",
  error: error ?? "הקלטת הקריינות נכשלה",
  carmen_next:
    "הקלטת הקריינות נכשלה. אמרי למשתמש במשפט אחד למה (error) ושאלי אם לנסות שוב. רק אם ביקש: workshop_produce_video עם redo_narration=true.",
});
