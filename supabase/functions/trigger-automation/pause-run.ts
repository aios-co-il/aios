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

/**
 * Stores a paused run and returns its id. An earlier open wait for the same
 * automation, step and entity is cancelled first, so the timer restarts; when
 * the new wait cannot be stored, the earlier one is put back.
 */
export async function pauseRunAtDelay(
  supabase: DbClient,
  run: DelayedRun,
): Promise<string> {
  // Built before any write, so a payload that cannot be stored changes nothing.
  const row = {
    tenant_id: run.tenantId,
    automation_id: run.automationId,
    delay_step_id: run.delayStepId,
    entity_id: run.entityId,
    trigger_type: run.triggerType,
    payload: storedPayload(run.payload),
    status_guard: delayStatusGuard(run.config, run.payload),
    resume_at: run.resumeAt.toISOString(),
  };
  const replacedIds = await cancelEarlierWait(supabase, run);

  // Not an upsert: the one-open-wait key is a partial unique index, which
  // PostgREST cannot target. A racing second wait fails loudly on that index.
  const inserted = await supabase
    .from("automation_delayed_runs")
    .insert(row)
    .select("id")
    .single();
  if (inserted.error) {
    await restoreWaits(supabase, run.tenantId, replacedIds);
    throw inserted.error;
  }
  return inserted.data.id;
}

/** Cancels the open wait for the run's automation, step and entity; returns the cancelled ids. */
async function cancelEarlierWait(
  supabase: DbClient,
  run: DelayedRun,
): Promise<Array<string>> {
  if (!run.entityId) {
    return [];
  }
  const replaced = await supabase
    .from("automation_delayed_runs")
    .update({
      status: "cancelled",
      outcome: "replaced_by_newer_wait",
      finished_at: new Date().toISOString(),
    })
    .eq("tenant_id", run.tenantId)
    .eq("automation_id", run.automationId)
    .eq("delay_step_id", run.delayStepId)
    .eq("entity_id", run.entityId)
    .eq("status", "waiting")
    .select("id");
  if (replaced.error) {
    throw replaced.error;
  }
  return replaced.data.map((wait) => wait.id);
}

/** Puts waits back after their replacement failed, so the lead keeps its earlier timer. */
async function restoreWaits(
  supabase: DbClient,
  tenantId: string,
  ids: Array<string>,
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const restored = await supabase
    .from("automation_delayed_runs")
    .update({ status: "waiting", outcome: null, finished_at: null })
    .eq("tenant_id", tenantId)
    .in("id", ids)
    .eq("status", "cancelled");
  if (restored.error) {
    console.error(
      "[delay-step] could not restore the earlier wait:",
      ids,
      restored.error,
    );
  }
}

/** The payload without run-scoped `_` keys (Carmen session state, node outputs). */
function storedPayload(payload: Record<string, unknown>): Json {
  const kept = Object.entries(payload).filter(([key]) => !key.startsWith("_"));
  return JSON.parse(JSON.stringify(Object.fromEntries(kept)));
}
