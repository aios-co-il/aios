/**
 * The narration from the user's own recording (narration-guide.ts) in the narration review
 * (narration-review.ts): which recording produce_video was handed, and the take it records from it.
 */

import {
  CREATIVE_VIDEO_BUCKET,
  guidePathIn,
  isGuidePathOf,
  type GuideAudio,
} from "../narration-guide.ts";
import { APPROVED_RUN, ASKED_RUN } from "./narration-approval.ts";
import { awaitTake, type ReviewContext } from "./narration-ask.ts";
import type { NarrationTake } from "./narration-take-state.ts";
import {
  RECORDED_GUIDE,
  recordNarration,
  type NarrationPlan,
} from "./narration-take.ts";

const NOT_THIS_PROJECT =
  "ההקלטה לא נמצאת בתיקיית הקריינות של הפרויקט הזה. הקליטו שוב בכפתור בעמוד הקריינות.";
const BUSY =
  "קריינות אחרת עדיין מוקלטת. כשתופיע בלוח, שלחו את ההקלטה שלכם שוב מהכפתור בעמוד.";
const TALKING =
  "בסרט הזה כל סצנה מדברת בקול משלה, אז אין קריינות אחת להחליף לה את הקול.";

/**
 * The recording produce_video was handed in this call (the guide_recording argument, else the
 * board's line in the user's message), null when there is none or it is the one the newest
 * recording already voiced (asked again for a fresh take with redo_narration), or an error for a
 * path outside this project's narration folder.
 */
export function guideRecording(
  ctx: ReviewContext,
  itemId: string,
  video: Record<string, unknown>,
): GuideAudio | { error: string } | null {
  const given =
    typeof ctx.args.guide_recording === "string"
      ? ctx.args.guide_recording.trim()
      : "";
  const path = given || guidePathIn(ctx.deps.userText);
  if (
    !path ||
    (path === video[RECORDED_GUIDE] && ctx.args.redo_narration !== true)
  ) {
    return null;
  }
  if (!isGuidePathOf(path, ctx.tenantId, itemId)) {
    console.error("[workshop] guide recording refused", itemId, path);
    return { error: NOT_THIS_PROJECT };
  }
  return { bucket: CREATIVE_VIDEO_BUCKET, path };
}

/**
 * The newest recording voiced the user's recording and the user has not approved the take it was
 * asked about: the review goes on in automatic mode too, so the turn that answers the question
 * (an approval, or "לתקן") is read as an answer instead of starting production on that take.
 */
export const guideAwaitsApproval = (video: Record<string, unknown>) =>
  typeof video[RECORDED_GUIDE] === "string" &&
  video[APPROVED_RUN] !== video[ASKED_RUN];

/**
 * The user's recording again, when they asked to retry (redo_narration) after the voice change of
 * it failed: the retry voices the same recording, not the narrator's reading. Null otherwise; a
 * redo after a take that worked records the narrator.
 */
export function retriedGuide(
  ctx: ReviewContext,
  video: Record<string, unknown>,
  take: NarrationTake | null,
): GuideAudio | null {
  const path = video[RECORDED_GUIDE];
  if (
    ctx.args.redo_narration !== true ||
    typeof path !== "string" ||
    take?.last_run_status !== "failed" ||
    take.last_run_id !== video[ASKED_RUN]
  ) {
    return null;
  }
  return { bucket: CREATIVE_VIDEO_BUCKET, path };
}

/**
 * Records the narration from the user's recording, charged like any take, and waits for it as
 * narrationStep waits for the narrator's. Stops with why when it cannot: a talking film, or a take
 * still being recorded (queueing now would be refused, so nothing is charged).
 */
export async function recordFromGuide(
  ctx: ReviewContext,
  itemId: string,
  payload: Record<string, unknown>,
  plan: NarrationPlan,
  take: NarrationTake | null,
  guide: GuideAudio,
): Promise<
  { stop: Record<string, unknown> } | { payload: Record<string, unknown> }
> {
  if (take?.talking) {
    return { stop: { error: TALKING } };
  }
  if (take?.in_flight) {
    return { stop: { error: BUSY } };
  }
  const recorded = await recordNarration(ctx, itemId, payload, plan, guide);
  if ("error" in recorded || "stop" in recorded) {
    return { stop: "stop" in recorded ? recorded.stop : recorded };
  }
  return await awaitTake(ctx, itemId, recorded.payload, recorded.runId);
}
