import type { PulseCostRules } from "./cost-rules.ts";
import { evaluateTargetlessCostTrend } from "./targetless-cost-trend.ts";
import {
  pulseTargetKindLabel,
  pulseTargetSourceLabel,
  type PulseTarget,
  type PulseTargetKind,
} from "./targets/kinds.ts";

/** A campaign's pulse status: colour, tier, why, and whether it alerts on WhatsApp. */
export type PulseCampaignStatus = {
  status: "healthy" | "warning" | "critical";
  tier: "normal" | "watch" | "exception";
  reason: string;
  alertEligible: boolean;
};

/** The baseline a target-less trend is judged on: real outcomes and spending days. */
export type BaselineGuard = { outcomes: number | null; days: number };

/**
 * The baseline must be solid before a trend without a target can alert: its real
 * (unscaled) outcomes and the number of days that actually spent.
 */
export function measureBaselineGuard<Row extends { data: { date?: unknown } }>(
  rows: Row[],
  outcomes: number | null,
  spendOf: (row: Row) => number,
): BaselineGuard {
  const days = new Set(
    rows.filter((row) => spendOf(row) > 0).map((row) => row.data.date),
  ).size;
  return { outcomes, days };
}

/**
 * The reasons for a campaign judged against its target. An approved target and
 * Carmen's market target alert the same way; the reason says which one it was,
 * so people know when the bar is Carmen's estimate.
 */
export function targetStatusReasons(
  target: Pick<PulseTarget, "kind" | "value" | "source">,
): { breach: string; drift: string; within: string } {
  if (target.source !== "carmen_market") {
    return {
      breach: `חריגה מתמשכת מהיעד המאושר (${target.kind.toUpperCase()} ${target.value})`,
      drift: "חריגה מהיעד המאושר ב־7 ימים; נדרשת התמדה לפני התראה",
      within: "התוצאה בתוך היעד המאושר",
    };
  }
  const label = pulseTargetSourceLabel("carmen_market");
  return {
    breach: `חריגה מתמשכת מול ${label} (${pulseTargetKindLabel(target.kind)} ${target.value})`,
    drift: `חריגה מול ${label} ב־7 ימים; נדרשת התמדה לפני התראה`,
    within: `התוצאה בתוך ${label}`,
  };
}

/**
 * Spend with no result at all in the last 3 days has no cost per result, and is
 * worse than any rise, so it counts past every threshold (the 7-day window,
 * minimum spend and baseline guards still decide). A day with 0 leads reads as
 * "no value" (pulseCampaignOutcome), so 3 such days aggregate to null, not 0.
 */
export function noResultsIn3Days(
  current3: { spend: number; outcomes: number | null },
  useRoas: boolean,
): boolean {
  return !useRoas && current3.spend > 0 && !(Number(current3.outcomes) > 0);
}

/**
 * The status of a campaign without a target (or whose target has no current
 * value to compare), from its trend against the baseline and the cost rules.
 */
export function targetlessStatus(input: {
  goal: string;
  useRoas: boolean;
  trend3: number | null;
  trend7: number | null;
  spend7d: number;
  guard: BaselineGuard;
  rules: PulseCostRules;
  target: Pick<PulseTarget, "source"> | null;
}): PulseCampaignStatus {
  const verdict = evaluateTargetlessCostTrend({
    metric: targetlessMetric(input.goal, input.useRoas),
    trend3: input.trend3,
    trend7: input.trend7,
    spend7d: input.spend7d,
    baselineOutcomes: input.guard.outcomes,
    baselineDays: input.guard.days,
    rules: input.rules,
  });
  if (verdict.level === "exception" && verdict.reason) {
    // Red only when the alert is sent: while the tenant keeps target-less alerts
    // off, the exception is yellow everywhere (dashboard, digest, client status).
    return {
      status: verdict.alertEligible ? "critical" : "warning",
      tier: "exception",
      reason: verdict.reason,
      alertEligible: verdict.alertEligible,
    };
  }
  if (verdict.level === "watch" && verdict.reason) {
    return {
      status: "warning",
      tier: "watch",
      reason: verdict.reason,
      alertEligible: false,
    };
  }
  return {
    status: "healthy",
    tier: "normal",
    reason: healthyReason(input.target),
    alertEligible: false,
  };
}

/** The metric a target-less campaign is measured on. */
function targetlessMetric(goal: string, useRoas: boolean): PulseTargetKind {
  if (useRoas) {
    return "roas";
  }
  if (goal === "ecommerce") {
    return "cpa";
  }
  return goal === "leads" ? "cpl" : "cost_per_result";
}

/** Nothing stands out: within the target, or no target to compare with. */
function healthyReason(target: Pick<PulseTarget, "source"> | null): string {
  if (!target) {
    return "לא זוהתה חריגה; אין יעד להשוואה";
  }
  return target.source === "carmen_market"
    ? `בתוך ${pulseTargetSourceLabel("carmen_market")}`
    : "בתוך היעד המאושר";
}
