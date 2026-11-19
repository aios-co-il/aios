// Stores a flow run a delay step paused (AIO-611); automation-delay-worker
// resumes it from automation_delayed_runs.
import type { Json } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { type DelayStepConfig, delayStatusGuard } from "./delay-step.ts";

/** What a paused run needs stored to resume later. */
export type DelayedRun = {
  tenantId: string;
  automationId: string;
  delayStepId: string;
  entityId: string | null;
  triggerType: string | null;
  payload: Record<string, unknown>;
  config: DelayStepConfig;
  resumeAt: Date;
};

/** Postgres error code for a unique-index conflict. */
const UNIQUE_VIOLATION = "23505";

/**
 * Stores a paused run and returns its id. When the same automation, step and
 * entity already have an open wait, that row is restarted with the new resume
 * time, payload and guard. Each write is one statement, so a run that stops
 * midway never leaves a lead without its wait.
 */
export async function pauseRunAtDelay(
  supabase: DbClient,
  run: DelayedRun,
): Promise<string> {
  const wait = {
    trigger_type: run.triggerType,
    payload: storedPayload(run.payload),
    status_guard: delayStatusGuard(run.config, run.payload),
    resume_at: run.resumeAt.toISOString(),
  };
  const restartedId = await restartOpenWait(supabase, run, wait);
  if (restartedId) {
    return restartedId;
  }

  // Not an upsert: the one-open-wait key is a partial unique index, which
  // PostgREST cannot target.
  const inserted = await supabase
    .from("automation_delayed_runs")
    .insert({
      tenant_id: run.tenantId,
      automation_id: run.automationId,
      delay_step_id: run.delayStepId,
      entity_id: run.entityId,
      ...wait,
    })
    .select("id")
    .single();
  if (!inserted.error) {
    return inserted.data.id;
  }
  // A run for the same lead stored its wait between the two statements.
  const racedId =
    inserted.error.code === UNIQUE_VIOLATION
      ? await restartOpenWait(supabase, run, wait)
      : null;
  if (racedId) {
    return racedId;
  }
  throw inserted.error;
}

/** The columns a restarted wait gets anew. */
type WaitValues = {
  trigger_type: string | null;
  payload: Json;
  status_guard: Json;
  resume_at: string;
};

/** Restarts the open wait of the run's automation, step and entity; null when there is none. */
async function restartOpenWait(
  supabase: DbClient,
  run: DelayedRun,
  wait: WaitValues,
): Promise<string | null> {
  if (!run.entityId) {
    return null;
  }
  const restarted = await supabase
    .from("automation_delayed_runs")
    .update(wait)
    .eq("tenant_id", run.tenantId)
    .eq("automation_id", run.automationId)
    .eq("delay_step_id", run.delayStepId)
    .eq("entity_id", run.entityId)
    .eq("status", "waiting")
    .select("id")
    .maybeSingle();
  if (restarted.error) {
    throw restarted.error;
  }
  return restarted.data?.id ?? null;
}

/** The payload without run-scoped `_` keys (Carmen session state, node outputs). */
function storedPayload(payload: Record<string, unknown>): Json {
  const kept = Object.entries(payload).filter(([key]) => !key.startsWith("_"));
  return JSON.parse(JSON.stringify(Object.fromEntries(kept)));
}
