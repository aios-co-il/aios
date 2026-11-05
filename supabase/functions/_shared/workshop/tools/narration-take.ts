/**
 * The narration review's reads and its one paid step (narration-review.ts): the project's take as
 * workshop_narration_take reports it, and a new recording of the narration alone.
 */

import { withBudget, budgetOf, spendBudget } from "../budget.ts";
import type { Quote } from "../budget-types.ts";
import { costSceneOf, roundUsd, voiceEstimate } from "../cost-scene.ts";
import type { Db } from "../db.ts";
import { gatePaid, refundMissing } from "../gate.ts";
import { savePayload } from "../project-io.ts";
import { asRecord } from "../record.ts";
import type { ToolContext } from "../tool-context.ts";

const TOOL = "workshop_produce_video";

/** workshop_narration_take's answer (migration 20261105160000_workshop_narration_review). */
export interface NarrationTake {
  ready: boolean;
  talking: boolean;
  run_id: string | null;
  pronunciations_changed: boolean;
  in_flight: boolean;
  last_run_id: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
}

/** What produce_video knows when the narration is reviewed: the voice, the stage and the film's quote. */
export interface NarrationPlan {
  /** The film has narration lines (produce_video's withVoice). */
  narrated: boolean;
  /** The voice differs from the one saved on the project: the take on the board is in the old one. */
  newVoice: boolean;
  voiceId: string;
  stageId: string | null;
  engine: string;
  scenes: Array<Record<string, unknown>>;
  /** The rest of the film's quote, without its narration. */
  filmUsd: number;
  /** The paid units the rest of the film is quoted in. */
  units: number;
}

/** The project's take, or null when it cannot be read (logged; the review then lets production go on). */
export async function loadTake(
  supabase: Db,
  itemId: string,
): Promise<NarrationTake | null> {
  const { data, error } = await supabase.rpc("workshop_narration_take", {
    p_item_id: itemId,
  });
  if (error) {
    console.error("[workshop] narration take not read", itemId, error.message);
    return null;
  }
  if (!data || typeof data !== "object") {
    return null;
  }
  const take = asRecord(data);
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  const status = text(take.last_run_status);
  return {
    ready: take.ready === true,
    talking: take.talking === true,
    run_id: text(take.run_id),
    pronunciations_changed: take.pronunciations_changed === true,
    in_flight: status === "queued" || status === "running",
    last_run_id: text(take.last_run_id),
    last_run_status: status,
    last_run_error: text(take.last_run_error),
  };
}

/**
 * Records the narration alone, in the chosen voice. The budget check covers the whole film that
 * follows (so the user approves one budget, not one for the narration and another for the film),
 * and only the narration is charged now. Returns the run, a budget stop, or an error after giving
 * the charge back.
 */
export async function recordNarration(
  ctx: Pick<ToolContext, "supabase" | "tenantId" | "args" | "deps">,
  itemId: string,
  payload: Record<string, unknown>,
  plan: NarrationPlan,
): Promise<
  | { payload: Record<string, unknown>; runId: string }
  | { stop: Record<string, unknown> }
  | { error: string }
> {
  const { supabase, tenantId, args, deps } = ctx;
  const voiceUsd = narrationUsd(plan.scenes);
  const quote: Quote = {
    tool: TOOL,
    engine: plan.engine,
    count: plan.units + 1,
    usd: roundUsd(plan.filmUsd + voiceUsd),
  };
  const gate = await gatePaid(
    supabase,
    tenantId,
    itemId,
    payload,
    quote,
    args,
    deps,
    {
      narration_usd: voiceUsd,
      estimated_usd: quote.usd,
      message: `קודם מוקלטת הקריינות לבדיקה (כ-$${voiceUsd}); כל הסרט יעלה עד כ-$${quote.usd}.`,
    },
  );
  if ("stop" in gate) {
    return gate;
  }
  // The voice is saved with the charge: video_narration_ready checks the take against it.
  const charged = {
    ...spendBudget(pricedAt(gate.payload, voiceUsd), TOOL, 1),
    video: { ...asRecord(gate.payload.video), voice_id: plan.voiceId },
  };
  try {
    await savePayload(supabase, tenantId, itemId, charged);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "שמירת הפרויקט נכשלה",
    };
  }
  const runId = await queueNarration(supabase, itemId, plan, voiceUsd);
  if (!runId) {
    await refundMissing(supabase, tenantId, itemId, TOOL, 1);
    return { error: "הקלטת הקריינות לא הותחלה. נסי שוב בעוד רגע." };
  }
  return { payload: charged, runId };
}

/** Queues one continuous voice run of the narration; its id, or null when nothing was queued (logged). */
async function queueNarration(
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

/** The narration's quote: the film's narrated lines, as produce_video prices them. */
function narrationUsd(scenes: Array<Record<string, unknown>>) {
  const spoken = scenes
    .map(costSceneOf)
    .filter((scene) => !scene.lipsync && scene.voiceover_text.trim());
  return voiceEstimate(spoken).usd;
}

/** The payload with the produce step's unit price set to the narration's, so spend and refund charge it. */
const pricedAt = (payload: Record<string, unknown>, usd: number) => {
  const budget = budgetOf(payload);
  return withBudget(payload, {
    ...budget,
    unit_usd: { ...budget.unit_usd, [TOOL]: usd },
  });
};
