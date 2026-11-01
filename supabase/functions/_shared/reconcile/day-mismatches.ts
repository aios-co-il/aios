/**
 * Day-by-day mismatches of a campaign that both sides have (AIO-238): spend,
 * the campaign's primary result, and revenue when either side has some.
 */
import type { CampaignRef, CampaignSide } from "./campaign-sides.ts";
import {
  type DayMetrics,
  emptyMetrics,
  exceedsTolerance,
  primaryResultMetric,
  type ReconcileTolerance,
  round2,
} from "./metrics.ts";
import type { ReconcilePlatform } from "./run-status.ts";
import type { ReconcileFinding, ReconcileTable } from "./types.ts";

/** A mismatch finding per day and metric beyond tolerance, skipping `missingDates`. */
export function dayMismatches(
  input: {
    table: ReconcileTable;
    platform: ReconcilePlatform;
    dates: string[];
  },
  a: CampaignSide,
  p: CampaignSide,
  campaign: CampaignRef,
  missingDates: Set<string>,
  tolerance: ReconcileTolerance,
): ReconcileFinding[] {
  const resultMetric = primaryResultMetric(
    input.platform,
    p.sample || a.sample,
    input.table,
  );
  const out: ReconcileFinding[] = [];
  for (const date of input.dates) {
    const ad = a.days.get(date);
    const pd = p.days.get(date);
    if (missingDates.has(date) || (!ad && !pd)) {
      continue;
    }
    const am = ad ?? emptyMetrics();
    const pm = pd ?? emptyMetrics();
    for (const [metric, av, pv, unit] of metricChecks(am, pm, resultMetric)) {
      if (!exceedsTolerance(av, pv, unit, tolerance)) {
        continue;
      }
      out.push({
        kind: "mismatch",
        campaign_id: campaign.id,
        date,
        metric,
        aios_value: round2(av),
        platform_value: round2(pv),
        details: {
          campaign_name: campaign.name,
          ...(ad ? {} : { aios_row_missing: true }),
          ...(pd ? {} : { platform_row_missing: true }),
        },
      });
    }
  }
  return out;
}

/** The metrics a day is checked on: spend, the primary result, and revenue when either side has some. */
function metricChecks(
  am: DayMetrics,
  pm: DayMetrics,
  resultMetric: "leads" | "purchases" | "conversions" | null,
): Array<[string, number, number, "money" | "count"]> {
  const checks: Array<[string, number, number, "money" | "count"]> = [
    ["spend", am.spend, pm.spend, "money"],
  ];
  if (resultMetric) {
    checks.push([resultMetric, am[resultMetric], pm[resultMetric], "count"]);
  }
  if (am.revenue > 0 || pm.revenue > 0) {
    checks.push(["revenue", am.revenue, pm.revenue, "money"]);
  }
  return checks;
}
