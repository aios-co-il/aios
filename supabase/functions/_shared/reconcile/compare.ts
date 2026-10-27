/**
 * Stored campaign days against the platform's, campaign by campaign and day by
 * day: spend, the primary result and revenue (AIO-238).
 */
import {
  type CampaignRef,
  type CampaignSide,
  groupByCampaign,
  rekeyNamedRows,
  sideTotal,
} from "./campaign-sides.ts";
import { countFindings, sortFindings, sumTotals } from "./compare-summary.ts";
import { dayMismatches } from "./day-mismatches.ts";
import {
  exceedsTolerance,
  RECONCILE_TOLERANCE,
  type ReconcileTolerance,
  round2,
} from "./metrics.ts";
import { findMissingDays } from "./missing-days.ts";
import type { ReconcilePlatform } from "./run-status.ts";
import type { CompareTotals } from "./run-summary.ts";
import type {
  CampaignDayRow,
  FindingKind,
  ReconcileFinding,
  ReconcileTable,
} from "./types.ts";

export type CompareResult = {
  findings: ReconcileFinding[];
  counts: Record<FindingKind, number>;
  totals: CompareTotals;
  campaigns: { aios: number; platform: number; both: number };
  missing_dates: string[];
};

type CompareInput = {
  table: ReconcileTable;
  platform: ReconcilePlatform;
  aiosRows: CampaignDayRow[];
  platformRows: CampaignDayRow[];
  dates: string[];
  tolerance?: ReconcileTolerance;
};

/** Compare stored campaign days with the platform's for the given dates. */
export function compareCampaignDays(input: CompareInput): CompareResult {
  const tolerance = input.tolerance || RECONCILE_TOLERANCE;
  const dateSet = new Set(input.dates);
  const aios = groupByCampaign(input.platform, input.aiosRows, dateSet);
  const platform = groupByCampaign(input.platform, input.platformRows, dateSet);
  rekeyNamedRows(aios, platform);

  const missing = findMissingDays(aios, platform, input.dates, tolerance);
  const findings = missing.findings;
  let both = 0;
  for (const key of new Set([...aios.keys(), ...platform.keys()])) {
    const a = aios.get(key);
    const p = platform.get(key);
    const campaign = {
      id: key.startsWith("name:") ? null : key,
      name: p?.name || a?.name || null,
    };
    if (a && p) {
      both += 1;
      findings.push(
        ...dayMismatches(input, a, p, campaign, missing.dates, tolerance),
      );
      continue;
    }
    const finding = oneSidedFinding(a, p, campaign, missing.dates, tolerance);
    if (finding) {
      findings.push(finding);
    }
  }
  sortFindings(findings);

  return {
    findings,
    counts: countFindings(findings),
    totals: sumTotals(aios, platform),
    campaigns: { aios: aios.size, platform: platform.size, both },
    missing_dates: [...missing.dates].sort(),
  };
}

/** A campaign found on one side only, when its spend there is beyond tolerance. */
function oneSidedFinding(
  a: CampaignSide | undefined,
  p: CampaignSide | undefined,
  campaign: CampaignRef,
  missingDates: Set<string>,
  tolerance: ReconcileTolerance,
): ReconcileFinding | null {
  const side = a ?? p;
  if (!side) {
    return null;
  }
  const spend = sideTotal(side, missingDates).spend;
  const aiosValue = a ? spend : 0;
  const platformValue = p ? spend : 0;
  if (!exceedsTolerance(aiosValue, platformValue, "money", tolerance)) {
    return null;
  }
  const days = [...side.days.entries()]
    .filter(([date, m]) => !missingDates.has(date) && m.spend > 0)
    .map(([date]) => date)
    .sort();
  return {
    kind: a ? "missing_on_platform" : "missing_in_aios",
    campaign_id: campaign.id,
    date: null,
    metric: "spend",
    aios_value: round2(aiosValue),
    platform_value: round2(platformValue),
    details: { campaign_name: campaign.name, dates: days },
  };
}
