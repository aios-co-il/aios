// automation-delay-worker: resumes flow runs a delay step paused (AIO-611).
// pg_cron calls it every minute while a wait is due. Each call takes the due
// waits one at a time, claiming each just before its resume, drops the ones
// that should no longer run (automation off, delay step removed, lead left the
// guarded status) and asks trigger-automation to run the steps after the delay. A wait resumes at most once: a failed resume is
// recorded as failed and never retried, so a lead is never mailed twice.
import { bearerToken } from "../_shared/automation-run-auth.ts";
import { type DbClient, serviceClient } from "../_shared/supabase-clients.ts";
import { isServiceKey } from "../_shared/timing-safe-equal.ts";
import { resumeDueRuns } from "./drain.ts";
import { resumeDeps } from "./resume-deps.ts";
import { waitStore } from "./wait-store.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Stop starting resumes after this long; the rest stay waiting for the next call. */
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
    const counts = await resumeDueRuns(
      waitStore(supabase),
      resumeDeps(supabase),
      () => Date.now() - startedAt > MAX_RUN_MS,
    );
    return new Response(JSON.stringify(counts), { headers: JSON_HEADERS });
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
