import type { PulseSnapshotAlertInput } from "../pulse-instant-alerts.ts";
import { pulseTargetSourceLabel } from "./targets/kinds.ts";

/** One campaign_breakdown row of a snapshot, as the instant alert reads it. */
type AlertCampaign = NonNullable<
  PulseSnapshotAlertInput["campaign_breakdown"]
>[number];

/** The alert's "יעד:" text; a market target is named as Carmen's. */
export function alertTargetText(campaign: AlertCampaign): string {
  if (campaign.target_value === null || campaign.target_value === undefined) {
    return "אין יעד";
  }
  const market =
    campaign.target_source === "carmen_market"
      ? ` · ${pulseTargetSourceLabel("carmen_market")}`
      : "";
  return `${String(campaign.target_kind || "יעד").toUpperCase()} ${campaign.target_value}${market}`;
}

/**
 * Spend with no result in the last 3 days has no cost per result to show (a lead
 * day with 0 leads is stored as no value, so outcomes_3d is null).
 */
export function spentWithoutResults3d(campaign: AlertCampaign): boolean {
  return (
    campaign.efficiency_3d == null &&
    !(Number(campaign.outcomes_3d) > 0) &&
    Number(campaign.spend_3d) > 0
  );
}

/** Without a target the comparison is the baseline: the line says how far it moved. */
export function baselineTrendLines(campaign: AlertCampaign): string[] {
  const noResults3 = spentWithoutResults3d(campaign);
  if (
    campaign.target_value != null ||
    campaign.trend_7d_pct == null ||
    (campaign.trend_3d_pct == null && !noResults3)
  ) {
    return [];
  }
  const threeDays = noResults3 ? "אין תוצאות" : `${campaign.trend_3d_pct}%`;
  return [
    `החמרה מול הבסיס: 3 ימים ${threeDays} · 7 ימים ${campaign.trend_7d_pct}%`,
  ];
}
