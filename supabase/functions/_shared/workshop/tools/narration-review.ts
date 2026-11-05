/**
 * Semi-automatic mode: the user hears the narration before anything is animated. Dicta's nikud
 * still left words said wrong (Staging, 5 Nov: "מכירות" came out "מחירות"), and a wrong word was
 * only heard in the finished film, after every clip was paid for. Once the voice is chosen,
 * produce_video records the narration alone (narration-take.ts), waits for the take to land on
 * the board as a "קריינות" page (narration-ask.ts), and production waits for the user's approval
 * of that take. Corrections are tenant-wide pronunciations (save-pronunciation.ts); a changed one,
 * a new script or a new voice records the narration again. The approved take is the film's narration: produce_video queues
 * no voice run while video_narration_ready holds.
 */

import { savePayload } from "../project-io.ts";
import { asRecord } from "../record.ts";
import { isAutoMode } from "../workshop-mode.ts";
import {
  APPROVED_RUN,
  ASKED_RUN,
  NARRATION_QUESTION,
  narrationApprovedNow,
} from "./narration-approval.ts";
import {
  askAbout,
  awaitTake,
  failedStop,
  type ReviewContext,
} from "./narration-ask.ts";
import {
  RECORDED_SCRIPT,
  narrationScript,
  recordNarration,
  type NarrationPlan,
} from "./narration-take.ts";
import { loadTake, type NarrationTake } from "./narration-take-state.ts";

/**
 * Before produce_video quotes the film: the payload when the narration is approved (or needs no
 * review), else `stop` with what Carmen tells the user: the take is being recorded, the question
 * about a take on the board, or why the last recording failed. Automatic mode, a film with no
 * narration and a talking film (narrated scene by scene, nothing on the board to hear) pass. A
 * take that cannot be read stops with the error: production never goes on with an unheard take.
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
  const loaded = await loadTake(ctx.supabase, itemId);
  if ("error" in loaded) {
    return { stop: { error: loaded.error } };
  }
  const take = loaded.take;
  if (!take || take.talking) {
    return { payload };
  }
  const video = asRecord(payload.video);
  if (take.in_flight && take.last_run_id) {
    return await awaitTake(ctx, itemId, payload, take.last_run_id);
  }
  if (isFresh(take, ctx.args) && !plan.newVoice) {
    return await reviewTake(ctx, itemId, payload, take.run_id);
  }
  if (
    lastRecordingFailed(take, video) &&
    !changedSinceRecording(take, video, plan) &&
    ctx.args.redo_narration !== true
  ) {
    return { stop: failedStop(take.last_run_error) };
  }
  const recorded = await recordNarration(ctx, itemId, payload, plan);
  if ("error" in recorded || "stop" in recorded) {
    return { stop: "stop" in recorded ? recorded.stop : recorded };
  }
  return await awaitTake(ctx, itemId, recorded.payload, recorded.runId);
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

/**
 * The voice, the script or a pronunciation changed since the newest recording was queued: a new
 * recording would read something else, so a failure of the old one is no reason to stop.
 */
const changedSinceRecording = (
  take: NarrationTake,
  video: Record<string, unknown>,
  plan: NarrationPlan,
) =>
  plan.newVoice ||
  take.pronunciations_since_last_run ||
  video[RECORDED_SCRIPT] !== narrationScript(plan.scenes);
