// Scheduling rules for recurring agent_tasks (schedule_type = 'recurring' with
// a cron_expression and a next_run). Shared by dispatch-agent-tasks and the
// Carmen tasks UI so both compute the same next run.
import { nextCronRun } from "./cron-next.ts";

export const DEFAULT_TASK_TIMEZONE = "Asia/Jerusalem";

/**
 * A recurring run that is more than this late is not executed: the dispatcher
 * skips it and moves next_run forward. Prevents a backlog of stale runs (for
 * example old WhatsApp messages) after downtime or after re-enabling a task.
 */
export const STALE_RUN_WINDOW_MS = 6 * 60 * 60 * 1000;

export type RecurringDecision =
  | { action: "run"; nextRun: string | null }
  | { action: "skip_stale"; nextRun: string | null }
  | { action: "invalid"; nextRun: null };

export function computeNextRun(
  cronExpression: string | null | undefined,
  from: Date,
  timeZone: string | null | undefined = DEFAULT_TASK_TIMEZONE,
): string | null {
  if (!cronExpression) return null;
  const next = nextCronRun(
    cronExpression,
    from,
    timeZone || DEFAULT_TASK_TIMEZONE,
  );
  return next ? next.toISOString() : null;
}

/** Decide what the dispatcher does with a recurring task whose next_run is due. */
export function decideRecurringRun(
  task: {
    cron_expression: string | null;
    timezone?: string | null;
    next_run: string | null;
  },
  now: Date,
): RecurringDecision {
  const nextRun = computeNextRun(task.cron_expression, now, task.timezone);
  if (!nextRun) return { action: "invalid", nextRun: null };
  const due = task.next_run ? new Date(task.next_run).getTime() : NaN;
  if (Number.isFinite(due) && now.getTime() - due > STALE_RUN_WINDOW_MS) {
    return { action: "skip_stale", nextRun };
  }
  return { action: "run", nextRun };
}

/**
 * Result checkpoint for a fresh recurring occurrence: drop the previous run's
 * conversation so the agent starts the task anew instead of "continuing".
 */
export function freshOccurrenceResult(
  previous: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const prev = previous && typeof previous === "object" ? previous : {};
  const keep: Record<string, unknown> = {};
  for (const key of [
    "notify",
    "reminder_delivery",
    "last_output",
    "final_output",
  ]) {
    if (key in prev) keep[key] = prev[key];
  }
  return { ...keep, conversation_history: [], total_tool_calls: 0 };
}
