// automation-delay-worker: resumes flow runs a delay step paused (AIO-611).
// pg_cron calls it every minute while a wait is due. Each call claims the due
// waits, drops the ones that should no longer run (automation off, delay step
// removed, lead left the guarded status) and asks trigger-automation to run the
// steps after the delay. A wait resumes at most once: a failed resume is
// recorded as failed and never retried, so a lead is never mailed twice.
import { bearerToken } from "../_shared/automation-run-auth.ts";
import { type DbClient, serviceClient } from "../_shared/supabase-clients.ts";
import { isServiceKey } from "../_shared/timing-safe-equal.ts";
import { resumeDeps } from "./resume-deps.ts";
import {
  type PausedRun,
  type ResumeResult,
  resumePausedRun,
} from "./resume-run.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Stop starting resumes after this long; the rest go back to waiting. */
const MAX_RUN_MS = 90_000;

/** A claim older than this belongs to a worker that died mid-resume. */
const STALE_CLAIM_MS = 15 * 60_000;

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (
    !isServiceKey(bearerToken(req.headers.get("Authorization")), serviceKey)
  ) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  try {
    const supabase = serviceClient();
    const startedAt = Date.now();
    await failStaleClaims(supabase);
    const runs = await claimDueRuns(supabase);
    const deps = resumeDeps(supabase);

    const counts: Record<ResumeResult["status"], number> = {
      resumed: 0,
      cancelled: 0,
      failed: 0,
    };
    const unstarted: Array<string> = [];
    for (const run of runs) {
      if (Date.now() - startedAt > MAX_RUN_MS) {
        unstarted.push(run.id);
        continue;
      }
      const result = await resumePausedRun(run, deps);
      await recordResult(supabase, run, result);
      counts[result.status]++;
    }
    await releaseClaims(supabase, unstarted);

    return new Response(
      JSON.stringify({
        claimed: runs.length,
        released: unstarted.length,
        ...counts,
      }),
      { headers: JSON_HEADERS },
    );
  } catch (error) {
    console.error("[automation-delay-worker] run failed:", error);
    return new Response(JSON.stringify({ error: "worker_failed" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});

/** Marks claims a dead worker left behind as failed, so they are visible and never re-sent. */
async function failStaleClaims(supabase: DbClient): Promise<void> {
  const { data, error } = await supabase
    .from("automation_delayed_runs")
    .update({
      status: "failed",
      outcome: "resume_timed_out",
      finished_at: new Date().toISOString(),
    })
    .eq("status", "resuming")
    .lt("claimed_at", new Date(Date.now() - STALE_CLAIM_MS).toISOString())
    .select("id");
  if (error) {
    throw error;
  }
  if (data.length > 0) {
    console.error(
      "[automation-delay-worker] resumes timed out:",
      data.map((row) => row.id),
    );
  }
}

/**
 * Claims every due wait in one statement. A second worker's update re-checks
 * `status = 'waiting'` after the first commits, so each wait has one owner.
 * Waits of every org are claimed here; each is then handled under its own tenant_id.
 */
async function claimDueRuns(supabase: DbClient): Promise<Array<PausedRun>> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("automation_delayed_runs")
    .update({ status: "resuming", claimed_at: now })
    .eq("status", "waiting")
    .lte("resume_at", now)
    .select(
      "id, tenant_id, automation_id, delay_step_id, payload, status_guard",
    );
  if (error) {
    throw error;
  }
  return data;
}

/** Puts claimed waits this call had no time for back in the queue. */
async function releaseClaims(
  supabase: DbClient,
  ids: Array<string>,
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const { error } = await supabase
    .from("automation_delayed_runs")
    .update({ status: "waiting", claimed_at: null })
    .in("id", ids)
    .eq("status", "resuming");
  if (error) {
    throw error;
  }
}

/** Writes how a claimed wait ended. */
async function recordResult(
  supabase: DbClient,
  run: PausedRun,
  result: ResumeResult,
): Promise<void> {
  if (result.status === "failed") {
    console.error(
      `[automation-delay-worker] resume ${run.id} failed:`,
      result.outcome,
    );
  }
  const { error } = await supabase
    .from("automation_delayed_runs")
    .update({
      status: result.status,
      outcome: result.outcome,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("tenant_id", run.tenant_id);
  if (error) {
    throw error;
  }
}
