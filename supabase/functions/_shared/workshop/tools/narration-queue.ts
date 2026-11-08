/**
 * The voice runs the narration review queues (narration-take.ts recordNarration): the narrator's
 * reading of the script, or the user's own recording voiced again (narration-guide.ts).
 */

import type { Db } from "../db.ts";
import type { GuideAudio } from "../narration-guide.ts";
import { asRecord } from "../record.ts";
import type { NarrationPlan } from "./narration-take.ts";

/** Queues one continuous voice run of the narration; its id, or null when nothing was queued (logged). */
export async function queueNarration(
  supabase: Db,
  itemId: string,
  plan: NarrationPlan,
  voiceUsd: number,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("queue_video_sound", {
    p_item_id: itemId,
    p_kind: "voice",
    p_scene_ids: plan.scenes.map((scene) => String(scene.id)),
    p_provider: "elevenlabs",
    p_estimate: { usd: voiceUsd, credits: 0 },
    p_stage_id: plan.stageId,
    p_prompt: null,
    p_voice_id: plan.voiceId,
  });
  return queuedRun(itemId, data, error);
}

/** Queues the voice run that voices the user's recording `guide` again in the chosen voice. */
export async function queueGuide(
  supabase: Db,
  itemId: string,
  plan: NarrationPlan,
  voiceUsd: number,
  guide: GuideAudio,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("queue_narration_guide", {
    p_item_id: itemId,
    p_guide: { bucket: guide.bucket, path: guide.path },
    p_voice_id: plan.voiceId,
    p_estimate: { usd: voiceUsd, credits: 0 },
    p_stage_id: plan.stageId,
  });
  return queuedRun(itemId, data, error);
}

/** The id of the run a queue RPC returned, or null when nothing was queued (logged). */
function queuedRun(
  itemId: string,
  data: unknown,
  error: { message: string } | null,
): string | null {
  const run = asRecord(Array.isArray(data) ? data[0] : data);
  if (error || typeof run.id !== "string") {
    console.error(
      "[workshop] narration not queued",
      itemId,
      error?.message ?? "no run",
    );
    return null;
  }
  return run.id;
}
