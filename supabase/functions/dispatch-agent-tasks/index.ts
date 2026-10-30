// Cron-driven dispatcher for scheduled agent_tasks.
// Picks pending tasks whose scheduled_at <= now() (one-shot),
// recurring (daily/weekly) tasks whose next slot has elapsed,
// or cron-scheduled recurring tasks (schedule_type='recurring') whose
// next_run has arrived, and invokes run-agent-task for each.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  decideRecurringRun,
  freshOccurrenceResult,
} from "../_shared/agent-task-schedule.ts";
import { errorMessage } from "../_shared/error-message.ts";

interface DispatchedTask {
  id: string;
  title: string;
  schedule_type: string | null;
  next_run?: string | null;
}

interface DispatchError {
  stage?: string;
  id?: string;
  error: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const nowIso = new Date().toISOString();
  const oneDayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgoIso = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const dispatched: DispatchedTask[] = [];
  const errors: DispatchError[] = [];

  // Per-tenant cap on agent tasks running at the same time
  // (tenant_heartbeat_settings.max_concurrent_tasks, default 3). Tasks left
  // "running" for over 30 minutes are treated as stuck and don't count.
  const slots = new Map<string, number>();
  const stuckCutoffIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const takeSlot = async (tenantId: string | null): Promise<boolean> => {
    if (!tenantId) return true;
    if (!slots.has(tenantId)) {
      const [{ data: settings }, { count }] = await Promise.all([
        supabase
          .from("tenant_heartbeat_settings")
          .select("max_concurrent_tasks")
          .eq("tenant_id", tenantId)
          .maybeSingle(),
        supabase
          .from("agent_tasks")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "running")
          .gte("last_run", stuckCutoffIso),
      ]);
      const limit = Math.max(1, Number(settings?.max_concurrent_tasks) || 3);
      slots.set(tenantId, limit - (count ?? 0));
    }
    const left = slots.get(tenantId)!;
    if (left <= 0) return false;
    slots.set(tenantId, left - 1);
    return true;
  };
  const deferred: string[] = [];

  try {
    // 1. One-shot tasks: scheduled_at in the past, never ran, still pending.
    const { data: onceDue, error: onceErr } = await supabase
      .from("agent_tasks")
      .select(
        "id, tenant_id, title, scheduled_at, schedule_type, last_run, status, enabled",
      )
      .eq("status", "pending")
      .eq("schedule_type", "once")
      .eq("enabled", true)
      .is("last_run", null)
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(25);
    if (onceErr) throw onceErr;

    // 2. Daily recurring: enabled, last_run null or > 24h ago.
    const { data: dailyDue } = await supabase
      .from("agent_tasks")
      .select("id, tenant_id, title, schedule_type, last_run, status, enabled")
      .eq("schedule_type", "daily")
      .eq("enabled", true)
      .in("status", ["pending", "completed"])
      .or(`last_run.is.null,last_run.lte.${oneDayAgoIso}`)
      .limit(25);

    // 3. Weekly recurring.
    const { data: weeklyDue } = await supabase
      .from("agent_tasks")
      .select("id, tenant_id, title, schedule_type, last_run, status, enabled")
      .eq("schedule_type", "weekly")
      .eq("enabled", true)
      .in("status", ["pending", "completed"])
      .or(`last_run.is.null,last_run.lte.${sevenDaysAgoIso}`)
      .limit(25);

    const allTasks = [
      ...(onceDue || []),
      ...(dailyDue || []),
      ...(weeklyDue || []),
    ];

    // 4. Cron-scheduled recurring tasks (Carmen tasks panel). next_run is set
    // by the UI; each claim moves it to the following slot. A run that is
    // more than STALE_RUN_WINDOW_MS late is skipped (never replayed). A task
    // left "running" for over 30 minutes is treated as stuck.
    const stuckBeforeIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: cronDue, error: cronErr } = await supabase
      .from("agent_tasks")
      .select(
        "id, tenant_id, title, schedule_type, cron_expression, timezone, next_run, status, result",
      )
      .eq("schedule_type", "recurring")
      .eq("enabled", true)
      .not("cron_expression", "is", null)
      .not("next_run", "is", null)
      .lte("next_run", nowIso)
      .or(`status.neq.running,last_run.lt.${stuckBeforeIso}`)
      .order("next_run", { ascending: true })
      .limit(25);
    if (cronErr) errors.push({ stage: "cron_select", error: cronErr.message });

    const skipped: Array<{ id: string; missed: string | null }> = [];
    for (const task of cronDue || []) {
      const decision = decideRecurringRun(task, new Date(nowIso));
      if (decision.action === "invalid") {
        await supabase
          .from("agent_tasks")
          .update({
            enabled: false,
            next_run: null,
            result: {
              ...((task.result as Record<string, unknown>) || {}),
              last_error: `invalid cron_expression: ${task.cron_expression}`,
            },
          })
          .eq("id", task.id)
          .eq("next_run", task.next_run);
        errors.push({ id: task.id, error: "invalid cron_expression" });
        continue;
      }
      if (decision.action === "skip_stale") {
        await supabase
          .from("agent_tasks")
          .update({ next_run: decision.nextRun })
          .eq("id", task.id)
          .eq("next_run", task.next_run);
        skipped.push({ id: task.id, missed: task.next_run });
        continue;
      }
      if (!(await takeSlot(task.tenant_id))) {
        deferred.push(task.id);
        continue;
      }
      // Claim: guard on the next_run we read so overlapping ticks can't
      // double-fire, then start a fresh occurrence (no carried-over
      // conversation, fresh retry budget).
      const { data: claimed, error: claimErr } = await supabase
        .from("agent_tasks")
        .update({
          status: "running",
          last_run: nowIso,
          next_run: decision.nextRun,
          run_count: 0,
          started_at: nowIso,
          completed_at: null,
          result: freshOccurrenceResult(task.result as Record<string, unknown>),
        })
        .eq("id", task.id)
        .eq("next_run", task.next_run)
        .select("id")
        .maybeSingle();
      if (claimErr || !claimed) continue;

      fetch(`${SUPABASE_URL}/functions/v1/run-agent-task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ task_id: task.id }),
      }).catch((e) =>
        console.error(
          `[dispatch-agent-tasks] invoke failed for ${task.id}:`,
          e?.message,
        ),
      );
      dispatched.push({
        id: task.id,
        title: task.title,
        schedule_type: task.schedule_type,
        next_run: decision.nextRun,
      });
    }
    if (skipped.length) {
      console.log(
        `[dispatch-agent-tasks] skipped ${skipped.length} stale recurring runs`,
      );
    }

    for (const task of allTasks) {
      if (!(await takeSlot(task.tenant_id))) {
        deferred.push(task.id);
        continue;
      }
      // Atomically claim by stamping last_run and flipping status to running.
      // Use last_run guard to avoid double-firing if cron overlaps.
      const claimQuery = supabase
        .from("agent_tasks")
        .update({ last_run: nowIso, status: "running" })
        .eq("id", task.id);
      // For one-shot: only claim if last_run still null
      if (task.schedule_type === "once") {
        claimQuery.is("last_run", null);
      } else {
        // For recurring: only claim if last_run still in the past window we matched
        if (task.last_run) claimQuery.eq("last_run", task.last_run);
        else claimQuery.is("last_run", null);
      }
      const { data: claimed, error: claimErr } = await claimQuery
        .select("id")
        .maybeSingle();
      if (claimErr || !claimed) {
        // Another worker got it
        continue;
      }

      // Fire-and-forget run-agent-task. Must authenticate with the service-role
      // key — run-agent-task rejects the anon key with 401, which left claimed
      // tasks stuck in status='running' forever.
      fetch(`${SUPABASE_URL}/functions/v1/run-agent-task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ task_id: task.id }),
      }).catch((e) =>
        console.error(
          `[dispatch-agent-tasks] invoke failed for ${task.id}:`,
          e?.message,
        ),
      );

      dispatched.push({
        id: task.id,
        title: task.title,
        schedule_type: task.schedule_type,
      });
    }

    console.log(
      `[dispatch-agent-tasks] dispatched ${dispatched.length} tasks at ${nowIso}`,
    );
    return new Response(
      JSON.stringify({
        ok: true,
        count: dispatched.length,
        dispatched,
        deferred,
        errors,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("[dispatch-agent-tasks] error:", e);
    return new Response(JSON.stringify({ ok: false, error: errorMessage(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
