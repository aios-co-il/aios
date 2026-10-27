import {
  aggregateFacebookRecordsAtLevel,
  getEntityGroupKey,
  type AdsEntityLevel,
} from "@/lib/adsEntityLevel";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import type { CampaignGoal } from "@/lib/campaignGoals";
import { facebookCampaignGoals } from "@/lib/facebookCampaignGoal";

type RecordData = Record<string, unknown>;

/**
 * Facebook Insights rows of a shared report split into sales, lead and traffic
 * tables by the classifier the internal report and the weekly tab use, plus the
 * goal of each record for the KPIs. A leads-only table keeps every non-traffic
 * campaign in leads.
 */
export function groupSharedFacebookRows(
  records: Array<{ data?: RecordData | null }>,
  level: AdsEntityLevel,
  options: { leadsOnly: boolean },
): Record<CampaignGoal, FacebookCampaignRow[]> & {
  goalOf: (data: RecordData) => CampaignGoal;
} {
  const keyOf = (data: RecordData) => facebookEntityKey(data, level);
  const goals = facebookCampaignGoals(records, keyOf, options);
  const goalOf = (data: RecordData) => goals.get(keyOf(data)) ?? "leads";
  const rowsOf = (goal: CampaignGoal) =>
    aggregateFacebookRecordsAtLevel(
      records.filter((record) => goalOf(record.data ?? {}) === goal),
      level,
    );
  return {
    ecommerce: rowsOf("ecommerce"),
    leads: rowsOf("leads"),
    traffic: rowsOf("traffic"),
    goalOf,
  };
}

/** The key the shared Facebook aggregation groups a record under at this level. */
function facebookEntityKey(data: RecordData, level: AdsEntityLevel): string {
  return level === "campaign"
    ? String(data.campaign_name || data.campaign || "ללא שם")
    : getEntityGroupKey(data, level);
}
