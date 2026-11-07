/**
 * analyze-campaign-data's raw-table rows: one per campaign name in an event's
 * window, its leads counted by the campaign's report goal.
 */
import { getSpendFromData } from "../_shared/campaign-goal/ads-metrics.ts";
import type {
  CampaignGoalRecord,
  reportCampaignGoalOf,
} from "../_shared/campaign-goal/campaign-goals.ts";
import { adsRowOutcomes } from "../_shared/campaign-goal/outcomes.ts";
import type { ReportCampaignGoal } from "../_shared/campaign-goal/report-goals.ts";

export interface CampaignPeriodData {
  campaignName: string;
  eventDate: string;
  /** The campaign's goal in its report; null for a table the reports give no goal. */
  goal: ReportCampaignGoal | null;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  leads: number;
  costPerLead: number;
  lpViews: number | null;
  lpConversionRate: number | null;
  costPerView: number | null;
  spend: number;
}

type CampaignTotals = {
  goal: ReportCampaignGoal | null;
  impressions: number;
  clicks: number;
  leads: number;
  spend: number;
  lpViews: number | null;
  ctrSum: number;
  ctrCount: number;
  cpmSum: number;
  cpmCount: number;
};

export type VerdictOf = ReturnType<typeof reportCampaignGoalOf>;

/** One row per campaign name in the window. */
export function campaignRows(
  periodRecords: Array<CampaignGoalRecord>,
  verdictOf: VerdictOf,
  eventDate: string,
): Array<CampaignPeriodData> {
  const campaignMap = new Map<string, CampaignTotals>();
  for (const record of periodRecords) {
    const data = record.data ?? {};
    const campaignName = String(data.campaign_name || "לא צוין");
    const goal = verdictOf(record)?.goal;
    let campaign = campaignMap.get(campaignName);
    if (!campaign) {
      campaign = {
        goal: goal ?? null,
        impressions: 0,
        clicks: 0,
        leads: 0,
        spend: 0,
        lpViews: null,
        ctrSum: 0,
        ctrCount: 0,
        cpmSum: 0,
        cpmCount: 0,
      };
      campaignMap.set(campaignName, campaign);
    }
    campaign.impressions += parseInt(String(data.impressions)) || 0;
    campaign.clicks += parseInt(String(data.clicks)) || 0;
    campaign.leads += adsRowOutcomes(data, goal).leads;
    campaign.spend += getSpendFromData(data);

    const lpViewsRaw =
      data.lp_or_form_views ??
      data.lp_views ??
      data.landing_page_views ??
      data.landing_page_view ??
      data.lpViews ??
      null;
    const lpViewsParsed =
      lpViewsRaw === null || lpViewsRaw === undefined || lpViewsRaw === ""
        ? null
        : parseInt(String(lpViewsRaw).replace(/,/g, "")) || 0;
    if (lpViewsParsed !== null) {
      campaign.lpViews = (campaign.lpViews ?? 0) + lpViewsParsed;
    }
    if (data.ctr) {
      campaign.ctrSum += parseFloat(String(data.ctr));
      campaign.ctrCount++;
    }
    if (data.cpm) {
      campaign.cpmSum += parseFloat(String(data.cpm));
      campaign.cpmCount++;
    }
  }

  const rows: Array<CampaignPeriodData> = [];
  for (const [campaignName, metrics] of campaignMap) {
    const ctr =
      metrics.clicks > 0 && metrics.impressions > 0
        ? (metrics.clicks / metrics.impressions) * 100
        : metrics.ctrCount > 0
          ? metrics.ctrSum / metrics.ctrCount
          : 0;
    const cpc = metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0;
    const cpm =
      metrics.impressions > 0
        ? (metrics.spend / metrics.impressions) * 1000
        : metrics.cpmCount > 0
          ? metrics.cpmSum / metrics.cpmCount
          : 0;
    const costPerLead = metrics.leads > 0 ? metrics.spend / metrics.leads : 0;
    const lpConversionRate =
      metrics.lpViews === null
        ? null
        : metrics.lpViews > 0
          ? (metrics.leads / metrics.lpViews) * 100
          : 0;
    const costPerView =
      metrics.lpViews === null
        ? null
        : metrics.lpViews > 0
          ? metrics.spend / metrics.lpViews
          : 0;
    rows.push({
      campaignName,
      eventDate,
      goal: metrics.goal,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      ctr: round(ctr),
      cpc: round(cpc),
      cpm: round(cpm),
      leads: round(metrics.leads),
      costPerLead: round(costPerLead),
      lpViews: metrics.lpViews,
      lpConversionRate:
        lpConversionRate === null ? null : round(lpConversionRate),
      costPerView: costPerView === null ? null : round(costPerView),
      spend: round(metrics.spend),
    });
  }
  return rows;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
