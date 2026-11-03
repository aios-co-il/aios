import { resolvePulseCostRules, type PulseCostRules } from "./cost-rules.ts";
import { pulseTargetKindLabel, type PulseTargetKind } from "./targets/kinds.ts";

/** Why a target-less trend is or is not an exception, and whether it alerts. */
export type TargetlessVerdict = {
  level: "exception" | "watch" | null;
  reason: string | null;
  alertEligible: boolean;
  blockedBy: string[];
};

/**
 * Judge a campaign that has no target of any source. It is an exception when
 * its CPL/CPA rose by at least trend_pct on BOTH the 3-day and the 7-day window
 * against the baseline (or its ROAS fell by at least roas_drop_pct on both), it
 * spent at least min_spend_7d in the last 7 full days, and the baseline is solid:
 * at least min_baseline_outcomes outcomes over at least min_baseline_days days.
 * trend3 / trend7 are "worse by %" (positive = worse), as buildPulseCampaignRows
 * computes them: a CPL rise and a ROAS drop are both positive.
 *
 * The reason text carries the thresholds, never the live percentages, because it
 * is part of the instant-alert fingerprint and must stay the same from run to run.
 */
export function evaluateTargetlessCostTrend({
  metric,
  trend3,
  trend7,
  spend7d,
  baselineOutcomes,
  baselineDays,
  rules = resolvePulseCostRules(null),
}: {
  metric: PulseTargetKind;
  trend3: number | null;
  trend7: number | null;
  spend7d: number;
  baselineOutcomes: number | null;
  baselineDays: number;
  rules?: PulseCostRules;
}): TargetlessVerdict {
  if (trend3 === null || trend7 === null) {
    return { level: null, reason: null, alertEligible: false, blockedBy: [] };
  }
  const isRoas = metric === "roas";
  const threshold = isRoas ? rules.roas_drop_pct : rules.trend_pct;
  const blockedBy = blockers({
    metric,
    trend3,
    trend7,
    spend7d,
    baselineOutcomes,
    baselineDays,
    rules,
    threshold,
  });
  if (blockedBy.length === 0) {
    const direction = isRoas ? "ירידה" : "עלייה";
    return {
      level: "exception",
      reason: `${direction} מתמשכת ב־${pulseTargetKindLabel(metric)} מול הבסיס (${threshold}%+ ב־3 וב־7 ימים) — אין יעד`,
      alertEligible: rules.target_less_alerts === true,
      blockedBy,
    };
  }
  const watchThreshold = Math.min(rules.watch_pct, threshold);
  if (trend3 >= watchThreshold && trend7 >= watchThreshold) {
    return {
      level: "watch",
      reason: `מגמה מתמשכת למעקב${watchNote(blockedBy, rules)}; אין יעד ולכן לא נשלחת התראה`,
      alertEligible: false,
      blockedBy,
    };
  }
  return { level: null, reason: null, alertEligible: false, blockedBy };
}

/** Every guard the trend fails, in a fixed order. */
function blockers(input: {
  metric: PulseTargetKind;
  trend3: number;
  trend7: number;
  spend7d: number;
  baselineOutcomes: number | null;
  baselineDays: number;
  rules: PulseCostRules;
  threshold: number;
}): string[] {
  const { rules, threshold } = input;
  const blockedBy: string[] = [];
  // Engagement campaigns have no CPL/CPA/ROAS, so they never become exceptions here.
  if (
    input.metric !== "cpl" &&
    input.metric !== "cpa" &&
    input.metric !== "roas"
  ) {
    blockedBy.push("metric");
  }
  if (!(input.trend3 >= threshold && input.trend7 >= threshold)) {
    blockedBy.push("trend");
  }
  if (!(Number(input.spend7d) >= rules.min_spend_7d)) {
    blockedBy.push("min_spend");
  }
  if (!(Number(input.baselineOutcomes) >= rules.min_baseline_outcomes)) {
    blockedBy.push("baseline_outcomes");
  }
  if (!(Number(input.baselineDays) >= rules.min_baseline_days)) {
    blockedBy.push("baseline_days");
  }
  return blockedBy;
}

/** " (why it does not alert)" for a watch reason, or "" when only the trend is short. */
function watchNote(blockedBy: string[], rules: PulseCostRules): string {
  const notes: string[] = [];
  if (blockedBy.includes("min_spend")) {
    notes.push(`הוצאה מתחת ל־${formatAmount(rules.min_spend_7d)} ב־7 ימים`);
  }
  if (
    blockedBy.includes("baseline_outcomes") ||
    blockedBy.includes("baseline_days")
  ) {
    notes.push("בסיס השוואה קצר מדי");
  }
  return notes.length ? ` (${notes.join("; ")})` : "";
}

/** A whole amount with thousands separators. */
function formatAmount(value: number): string {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}
