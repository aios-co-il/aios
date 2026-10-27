import { getLeadsFromData } from "@/lib/adsMetrics";
import {
  getEntityDisplayName,
  getEntityGroupKey,
  type AdsEntityLevel,
} from "@/lib/adsEntityLevel";
import type { ReportCampaignGoal } from "@/lib/campaignGoals";
import { facebookCampaignGoals } from "@/lib/facebookCampaignGoal";
import {
  addFacebookFollowers,
  emptyFacebookFollowers,
  type FacebookFollowerTotals,
} from "@/lib/facebookFollowers";
import {
  addFacebookResult,
  emptyFacebookResultTotals,
  type FacebookResultTotals,
} from "@/lib/facebookResultMetric";

/** One campaign (or ad set / ad) row of the report's Facebook tables. */
export type FacebookReportCampaign = {
  name: string;
  impressions: number;
  clicks: number;
  leads: number;
  spend: number;
  purchases: number;
  purchase_value: number;
  add_to_cart: number;
  conversations: number;
  result: FacebookResultTotals;
  followers: FacebookFollowerTotals;
};

/** A row with its entity key, in the order the entity first appears. */
export type FacebookReportEntry = [string, FacebookReportCampaign];

/**
 * The report's Facebook rows at this level, split into sales, lead and traffic
 * tables by the goal classifier the shared report and weekly tab also use.
 */
export function groupFacebookReportCampaigns(
  records: Array<{ data?: Record<string, unknown> | null }>,
  level: AdsEntityLevel,
  options: { leadsOnly: boolean },
): Record<ReportCampaignGoal, FacebookReportEntry[]> {
  const entries = Object.entries(
    aggregateFacebookReportCampaigns(records, level),
  );
  const goals = facebookCampaignGoals(
    records,
    (data) => getEntityGroupKey(data, level),
    options,
  );
  const withGoal = (goal: ReportCampaignGoal) =>
    entries.filter(([key]) => goals.get(key) === goal);
  return {
    ecommerce: withGoal("ecommerce"),
    leads: withGoal("leads"),
    traffic: withGoal("traffic"),
  };
}

/** Sums each entity's delivery, results, Meta result and followers over its records. */
function aggregateFacebookReportCampaigns(
  records: Array<{ data?: Record<string, unknown> | null }>,
  level: AdsEntityLevel,
): Record<string, FacebookReportCampaign> {
  const groups: Record<string, FacebookReportCampaign> = {};
  for (const record of records) {
    const data = record.data || {};
    const key = getEntityGroupKey(data, level);
    const group = (groups[key] ??= {
      name: getEntityDisplayName(data, level),
      impressions: 0,
      clicks: 0,
      leads: 0,
      spend: 0,
      purchases: 0,
      purchase_value: 0,
      add_to_cart: 0,
      conversations: 0,
      result: emptyFacebookResultTotals(),
      followers: emptyFacebookFollowers(),
    });
    group.impressions += Number(data.impressions) || 0;
    group.clicks += Number(data.clicks) || 0;
    group.leads += getLeadsFromData(data);
    group.spend += Number(data.spend) || 0;
    group.purchases += Number(data.purchases) || 0;
    group.purchase_value += Number(data.purchase_value) || 0;
    group.add_to_cart += Number(data.add_to_cart) || 0;
    group.conversations += Number(data.conversations) || 0;
    group.result = addFacebookResult(group.result, data);
    group.followers = addFacebookFollowers(group.followers, data);
  }
  return groups;
}
