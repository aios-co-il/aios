/**
 * Thresholds for flagging a campaign that has no target (AIO-236).
 *
 * One module for the snapshot (campaign-pulse-snapshot → buildPulseCampaignRows) and
 * the dashboard (DMMDashboard → buildPulseCampaignRows, pulse-attention-matrix), so
 * both mark the same campaigns. Tenants may override the numbers in
 * tenant_heartbeat_settings.pulse_alert_rules.manager.cost.
 *
 * A campaign without a target is an exception when its CPL/CPA rose by at least
 * trend_pct on BOTH the 3-day and the 7-day window against the baseline (or its ROAS
 * fell by at least roas_drop_pct on both), it spent at least min_spend_7d in the
 * last 7 full days (the table's currency, used as-is), and the baseline is solid:
 * at least min_baseline_outcomes outcomes over at least min_baseline_days days.
 *
 * Such an exception is sent on WhatsApp only when the tenant turned on
 * target_less_alerts. It ships off, so a deploy does not send a burst of alerts for
 * every campaign that already trends badly; the dashboard shows them in the meantime.
 */

export const PULSE_COST_RULE_DEFAULTS = Object.freeze({
  trend_pct: 40,
  roas_drop_pct: 25,
  min_spend_7d: 300,
  min_baseline_outcomes: 3,
  min_baseline_days: 14,
  /** Below the exception thresholds, a sustained trend this large is shown as "watch". */
  watch_pct: 25,
  target_less_alerts: false,
});

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

/**
 * @param {unknown} pulseAlertRules tenant_heartbeat_settings.pulse_alert_rules (any shape)
 * @returns {typeof PULSE_COST_RULE_DEFAULTS}
 */
export function resolvePulseCostRules(pulseAlertRules) {
  const rules =
    pulseAlertRules && typeof pulseAlertRules === "object"
      ? pulseAlertRules
      : {};
  const manager =
    rules.manager && typeof rules.manager === "object" ? rules.manager : {};
  const cost =
    manager.cost && typeof manager.cost === "object" ? manager.cost : {};
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

/** The cost metric a campaign without a target is measured on. */
export function targetlessMetricLabel(metric) {
  if (metric === "roas") return "ROAS";
  if (metric === "cpa") return "CPA";
  if (metric === "cpl") return "CPL";
  return "עלות לתוצאה";
}

function formatAmount(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}

/**
 * Judge a campaign that has no target of any source.
 * trend3 / trend7 are "worse by %" (positive = worse), as buildPulseCampaignRows
 * computes them: a CPL rise and a ROAS drop are both positive.
 *
 * The reason text carries the thresholds, never the live percentages, because it is
 * part of the instant-alert fingerprint and must stay the same from run to run.
 *
 * @param {{
 *   metric: "cpl" | "cpa" | "roas" | "cost_per_result",
 *   trend3: number | null,
 *   trend7: number | null,
 *   spend7d: number,
 *   baselineOutcomes: number | null,
 *   baselineDays: number,
 *   rules?: ReturnType<typeof resolvePulseCostRules>,
 * }} input
 * @returns {{ level: "exception" | "watch" | null, reason: string | null, alertEligible: boolean, blockedBy: string[] }}
 */
export function evaluateTargetlessCostTrend({
  metric,
  trend3,
  trend7,
  spend7d,
  baselineOutcomes,
  baselineDays,
  rules = resolvePulseCostRules(null),
}) {
  const none = {
    level: null,
    reason: null,
    alertEligible: false,
    blockedBy: [],
  };
  if (trend3 === null || trend7 === null) return none;
  const label = targetlessMetricLabel(metric);
  const isRoas = metric === "roas";
  // Engagement campaigns have no CPL/CPA/ROAS, so they never become exceptions here.
  const costMetric = metric === "cpl" || metric === "cpa" || isRoas;
  const threshold = isRoas ? rules.roas_drop_pct : rules.trend_pct;

  const blockedBy = [];
  if (!costMetric) blockedBy.push("metric");
  if (!(trend3 >= threshold && trend7 >= threshold)) blockedBy.push("trend");
  if (!(Number(spend7d) >= rules.min_spend_7d)) blockedBy.push("min_spend");
  if (!(Number(baselineOutcomes) >= rules.min_baseline_outcomes))
    blockedBy.push("baseline_outcomes");
  if (!(Number(baselineDays) >= rules.min_baseline_days))
    blockedBy.push("baseline_days");

  if (blockedBy.length === 0) {
    const direction = isRoas ? "ירידה" : "עלייה";
    return {
      level: "exception",
      reason: `${direction} מתמשכת ב־${label} מול הבסיס (${threshold}%+ ב־3 וב־7 ימים) — אין יעד`,
      alertEligible: rules.target_less_alerts === true,
      blockedBy,
    };
  }

  const watchThreshold = Math.min(rules.watch_pct, threshold);
  if (trend3 >= watchThreshold && trend7 >= watchThreshold) {
    const notes = [];
    if (blockedBy.includes("min_spend"))
      notes.push(`הוצאה מתחת ל־${formatAmount(rules.min_spend_7d)} ב־7 ימים`);
    if (
      blockedBy.includes("baseline_outcomes") ||
      blockedBy.includes("baseline_days")
    )
      notes.push("בסיס השוואה קצר מדי");
    const note = notes.length ? ` (${notes.join("; ")})` : "";
    return {
      level: "watch",
      reason: `מגמה מתמשכת למעקב${note}; אין יעד ולכן לא נשלחת התראה`,
      alertEligible: false,
      blockedBy,
    };
  }
  return { ...none, blockedBy };
}
