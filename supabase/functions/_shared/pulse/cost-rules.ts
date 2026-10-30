import { isJsonObject } from "./json.ts";

/**
 * Thresholds for a campaign that has no target. A tenant overrides them in
 * tenant_heartbeat_settings.pulse_alert_rules.manager.cost; the snapshot and the
 * dashboard both read them through resolvePulseCostRules, so they mark the same
 * campaigns.
 */
export type PulseCostRules = {
  /** CPL/CPA rise (%) on both the 3- and 7-day windows that makes an exception. */
  trend_pct: number;
  /** ROAS drop (%) on both windows that makes an exception. */
  roas_drop_pct: number;
  /** Spend in the last 7 full days (the table's currency, used as-is). */
  min_spend_7d: number;
  min_baseline_outcomes: number;
  min_baseline_days: number;
  /** Below the exception thresholds, a sustained trend this large is shown as "watch". */
  watch_pct: number;
  /**
   * Sends these exceptions on WhatsApp. It ships off, so a deploy does not send a
   * burst of alerts for every campaign that already trends badly; the dashboard
   * shows them in the meantime.
   */
  target_less_alerts: boolean;
};

export const PULSE_COST_RULE_DEFAULTS: Readonly<PulseCostRules> = Object.freeze(
  {
    trend_pct: 40,
    roas_drop_pct: 25,
    min_spend_7d: 300,
    min_baseline_outcomes: 3,
    min_baseline_days: 14,
    watch_pct: 25,
    target_less_alerts: false,
  },
);

/** The tenant's cost rules from pulse_alert_rules (any shape); defaults for anything invalid. */
export function resolvePulseCostRules(
  pulseAlertRules: unknown,
): PulseCostRules {
  const rules = isJsonObject(pulseAlertRules) ? pulseAlertRules : {};
  const manager = isJsonObject(rules.manager) ? rules.manager : {};
  const cost = isJsonObject(manager.cost) ? manager.cost : {};
  const d = PULSE_COST_RULE_DEFAULTS;
  return {
    trend_pct: positiveNumber(cost.trend_pct, d.trend_pct),
    roas_drop_pct: positiveNumber(cost.roas_drop_pct, d.roas_drop_pct),
    min_spend_7d: nonNegativeNumber(cost.min_spend_7d, d.min_spend_7d),
    min_baseline_outcomes: nonNegativeNumber(
      cost.min_baseline_outcomes,
      d.min_baseline_outcomes,
    ),
    min_baseline_days: nonNegativeNumber(
      cost.min_baseline_days,
      d.min_baseline_days,
    ),
    watch_pct: positiveNumber(cost.watch_pct, d.watch_pct),
    target_less_alerts: cost.target_less_alerts === true,
  };
}

/** The value when it is a number above 0, else the fallback. */
function positiveNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/** The value when it is a number of 0 or more, else the fallback. */
function nonNegativeNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
