import {
  computeNextRun,
  DEFAULT_TASK_TIMEZONE,
} from "../../_shared/agent-task-schedule.ts";
import { isValidCron, localParts } from "../../_shared/cron-next.ts";
import type { CreateAgentTaskArgs } from "./task-creation.ts";

export type RecurringSchedule = {
  cron_expression: string;
  timezone: string;
  next_run: string | null;
};

/**
 * The cron schedule a daily or weekly task is stored with, or null for a
 * one-off task. The hour (and the weekday of a weekly task) come from
 * `scheduled_at` read in Israel time, because the model sends that instant
 * reliably while its cron expressions have come in UTC. Without a usable
 * `scheduled_at` the task keeps the cron it was given, else it repeats at the
 * hour it was created.
 */
export function recurringScheduleFor(
  args: Pick<
    CreateAgentTaskArgs,
    "schedule_type" | "scheduled_at" | "cron_expression"
  >,
  now: Date,
): RecurringSchedule | null {
  const cadence = args.schedule_type;
  if (cadence !== "daily" && cadence !== "weekly") {
    return null;
  }

  const firstRun = args.scheduled_at ? new Date(args.scheduled_at) : null;
  const anchor =
    firstRun && !Number.isNaN(firstRun.getTime()) ? firstRun : null;
  const givenCron =
    !anchor && args.cron_expression && isValidCron(args.cron_expression)
      ? args.cron_expression.trim()
      : null;
  const cronExpression = givenCron ?? cronAt(anchor ?? now, cadence);

  return {
    cron_expression: cronExpression,
    timezone: DEFAULT_TASK_TIMEZONE,
    next_run: computeNextRun(cronExpression, now, DEFAULT_TASK_TIMEZONE),
  };
}

/** The cron that repeats at the Israel wall-clock time of `instant`. */
function cronAt(instant: Date, cadence: "daily" | "weekly"): string {
  const local = localParts(instant, DEFAULT_TASK_TIMEZONE);
  const weekday = new Date(
    Date.UTC(local.year, local.month - 1, local.day),
  ).getUTCDay();

  return `${local.minute} ${local.hour} * * ${cadence === "weekly" ? weekday : "*"}`;
}
