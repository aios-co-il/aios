/** Per-run flood guard for campaign_exception messages (AIO-243). */
import type { PlannedInstantAlert } from "./planned-alert.ts";

const DEFAULT_MAX_EXCEPTION_MESSAGES_PER_RUN = 3;
const MAX_EXCEPTION_MESSAGES_PER_RUN_LIMIT = 10;

/**
 * A deploy or a bad sync must not burst alerts: per phone and run, at most
 * `cap` campaign_exception messages go out, most severe first. Each exception
 * keeps only the phones under the cap in `individual`; the returned map holds,
 * per phone, the exceptions that go into its one summary message instead.
 */
export function capExceptionMessages(
  planned: PlannedInstantAlert[],
  cap: number,
): Map<string, PlannedInstantAlert[]> {
  const exceptionMessagesByPhone = new Map<string, number>();
  const summaryByPhone = new Map<string, PlannedInstantAlert[]>();
  const exceptions = planned
    .filter((item) => item.candidate.rule_type === "campaign_exception")
    // A stable sort: equal severity keeps the evaluation order.
    .sort(
      (a, b) =>
        (b.candidate.severity_score ?? 0) - (a.candidate.severity_score ?? 0),
    );
  for (const item of exceptions) {
    item.individual = [];
    for (const phone of item.recipients) {
      const used = exceptionMessagesByPhone.get(phone) || 0;
      if (used < cap) {
        exceptionMessagesByPhone.set(phone, used + 1);
        item.individual.push(phone);
      } else {
        summaryByPhone.set(phone, [...(summaryByPhone.get(phone) || []), item]);
      }
    }
  }

  return summaryByPhone;
}

/**
 * pulse_alert_rules.instant.max_exception_messages_per_run, clamped to
 * 1..10. Missing or not a number → DEFAULT_MAX_EXCEPTION_MESSAGES_PER_RUN.
 */
export function maxExceptionMessagesPerRun(rules: unknown): number {
  const raw =
    isRecord(rules) && isRecord(rules.instant)
      ? rules.instant.max_exception_messages_per_run
      : undefined;
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_EXCEPTION_MESSAGES_PER_RUN;
  }

  return Math.min(
    MAX_EXCEPTION_MESSAGES_PER_RUN_LIMIT,
    Math.max(1, Math.floor(value)),
  );
}

/** True for any non-null object, arrays included. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
