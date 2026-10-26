// Types for pulse-cost-rules.mjs (plain ESM shared by Deno and the Vite app).

export type PulseCostRules = {
  trend_pct: number;
  roas_drop_pct: number;
  min_spend_7d: number;
  min_baseline_outcomes: number;
  min_baseline_days: number;
  watch_pct: number;
  target_less_alerts: boolean;
};

export const PULSE_COST_RULE_DEFAULTS: Readonly<PulseCostRules>;

export function resolvePulseCostRules(pulseAlertRules: unknown): PulseCostRules;

export function targetlessMetricLabel(metric: string): string;

export function evaluateTargetlessCostTrend(input: {
  metric: "cpl" | "cpa" | "roas" | "cost_per_result";
  trend3: number | null;
  trend7: number | null;
  spend7d: number;
  baselineOutcomes: number | null;
  baselineDays: number;
  rules?: PulseCostRules;
}): {
  level: "exception" | "watch" | null;
  reason: string | null;
  alertEligible: boolean;
  blockedBy: string[];
};
