/**
 * The order, counts and totals a comparison reports (AIO-238).
 */
import { type CampaignSide, sideTotal } from "./campaign-sides.ts";
import { round2 } from "./metrics.ts";
import type { CompareTotals } from "./run-summary.ts";
import type { FindingKind, ReconcileFinding } from "./types.ts";

/** Sorts in place: missing days, then one-sided campaigns, then mismatches, biggest gap first. */
export function sortFindings(findings: ReconcileFinding[]): void {
  findings.sort((x, y) => {
    const order = FINDING_ORDER[x.kind] - FINDING_ORDER[y.kind];
    if (order) {
      return order;
    }
    const dx = Math.abs((x.aios_value ?? 0) - (x.platform_value ?? 0));
    const dy = Math.abs((y.aios_value ?? 0) - (y.platform_value ?? 0));
    return dy - dx;
  });
}

/** How many findings of each kind, zero included. */
export function countFindings(
  findings: ReconcileFinding[],
): Record<FindingKind, number> {
  const counts: Record<FindingKind, number> = {
    mismatch: 0,
    missing_day: 0,
    missing_in_aios: 0,
    missing_on_platform: 0,
    unmapped_account: 0,
  };
  for (const f of findings) {
    counts[f.kind] += 1;
  }
  return counts;
}

/** Spend and revenue over every compared day, per side. */
export function sumTotals(
  aios: Map<string, CampaignSide>,
  platform: Map<string, CampaignSide>,
): CompareTotals {
  return { aios: sumSides(aios), platform: sumSides(platform) };
}

const FINDING_ORDER: Record<FindingKind, number> = {
  missing_day: 0,
  missing_in_aios: 1,
  missing_on_platform: 2,
  mismatch: 3,
  unmapped_account: 4,
};

/** One side's spend and revenue, rounded once after summing. */
function sumSides(sides: Map<string, CampaignSide>): {
  spend: number;
  revenue: number;
} {
  let spend = 0;
  let revenue = 0;
  for (const side of sides.values()) {
    const total = sideTotal(side, new Set());
    spend += total.spend;
    revenue += total.revenue;
  }
  return { spend: round2(spend), revenue: round2(revenue) };
}
