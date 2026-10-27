/**
 * pulse_alert_rules.instant: limits of one instant-alert run (AIO-243). The
 * edge and frontend pulse rule parsers both carry it, so saving the pulse
 * rules dialog keeps what an operator set.
 */
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
