/**
 * Days AIOS holds no campaign rows for at all while the platform spent: a sync
 * that skipped a day shows up here once, not as a mismatch per campaign
 * (AIO-238).
 */
import type { CampaignSide } from "./campaign-sides.ts";
import {
  exceedsTolerance,
  type ReconcileTolerance,
  round2,
} from "./metrics.ts";
import type { ReconcileFinding } from "./types.ts";

/** missing_day findings, and their dates for the per-campaign checks to skip. */
export function findMissingDays(
  aios: Map<string, CampaignSide>,
  platform: Map<string, CampaignSide>,
  dates: string[],
  tolerance: ReconcileTolerance,
): { findings: ReconcileFinding[]; dates: Set<string> } {
  const aiosDates = new Set<string>();
  for (const side of aios.values()) {
    for (const date of side.days.keys()) {
      aiosDates.add(date);
    }
  }
  const findings: ReconcileFinding[] = [];
  const missing = new Set<string>();
  for (const date of dates) {
    if (aiosDates.has(date)) {
      continue;
    }
    const { spend, campaigns } = platformSpendOn(platform, date);
    if (!exceedsTolerance(0, spend, "money", tolerance)) {
      continue;
    }
    missing.add(date);
    findings.push({
      kind: "missing_day",
      campaign_id: null,
      date,
      metric: "spend",
      aios_value: 0,
      platform_value: round2(spend),
      details: { campaigns_with_spend: campaigns },
    });
  }
  return { findings, dates: missing };
}

/** The platform's spend on `date`, and how many campaigns spent. */
function platformSpendOn(
  platform: Map<string, CampaignSide>,
  date: string,
): { spend: number; campaigns: number } {
  let spend = 0;
  let campaigns = 0;
  for (const side of platform.values()) {
    const day = side.days.get(date);
    if (!day) {
      continue;
    }
    spend += day.spend;
    if (day.spend > 0) {
      campaigns += 1;
    }
  }
  return { spend, campaigns };
}
