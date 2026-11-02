/** Per-run flood guard for campaign_exception messages (AIO-243). */
import type { PlannedInstantAlert } from "./planned-alert.ts";

/**
 * A deploy or a bad sync must not burst alerts: per phone in one org's run,
 * at most `cap` campaign_exception messages go out, most severe first. Each
 * exception keeps only the phones under the cap in `individual`; the returned
 * map holds, per phone, the exceptions that go into its one summary message
 * instead.
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

/** pulse_alert_rules.instant: the limits of one org's instant-alert run. */
export type PulseInstantRunRules = {
  /** campaign_exception messages per recipient phone, org and run. */
  max_exception_messages_per_run: number;
};

const DEFAULT_MAX_EXCEPTION_MESSAGES_PER_RUN = 3;
const MAX_EXCEPTION_MESSAGES_PER_RUN_LIMIT = 10;

/**
 * The stored `instant` value with max_exception_messages_per_run clamped to
 * 1..MAX_EXCEPTION_MESSAGES_PER_RUN_LIMIT; missing or not a number →
 * DEFAULT_MAX_EXCEPTION_MESSAGES_PER_RUN.
 */
export function parsePulseInstantRunRules(raw: unknown): PulseInstantRunRules {
  const value =
    typeof raw === "object" &&
    raw !== null &&
    "max_exception_messages_per_run" in raw
      ? raw.max_exception_messages_per_run
      : undefined;
  const cap =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return {
    max_exception_messages_per_run: Number.isFinite(cap)
      ? Math.min(
          MAX_EXCEPTION_MESSAGES_PER_RUN_LIMIT,
          Math.max(1, Math.floor(cap)),
        )
      : DEFAULT_MAX_EXCEPTION_MESSAGES_PER_RUN,
  };
}
