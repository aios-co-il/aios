import { getSpendFromData, hasAddToCartMetric } from "@/lib/adsMetrics";
import { adsRowOutcomes } from "@/lib/adsRowOutcomes";
import {
  reportCampaignKey,
  type ReportCampaignGoal,
} from "@/lib/campaignGoals";
import {
  addAdsFigures,
  emptyReportFigures,
  type ReportFigures,
} from "../metrics/reportFigures";
import type {
  ReportCampaignRow,
  ReportChannel,
  ReportPeriodScope,
} from "./reportData";

/** One scope being added up, row by row. */
export type ScopeAccumulator = {
  figures: ReportFigures;
  channels: Map<ReportChannel, ReportFigures>;
  days: Map<string, ReportFigures>;
  campaigns: Map<string, ReportCampaignRow>;
};

/** One campaign-level ads row, its goal and channel. */
export type GoalAdsRow = {
  tableId: string;
  data: Record<string, unknown>;
  goal: ReportCampaignGoal;
  channel: ReportChannel;
  /** Whether the campaign is off, by the reports' on/off rule (campaignOffKeys). */
  off: boolean;
};

/** An empty accumulator. */
export function newScopeAccumulator(): ScopeAccumulator {
  return {
    figures: emptyReportFigures(),
    channels: new Map(),
    days: new Map(),
    campaigns: new Map(),
  };
}

/** Adds one ads row to the scope's totals, channel, day and campaign. */
export function accumulateAdsRow(acc: ScopeAccumulator, row: GoalAdsRow) {
  const figures = adsRowFigures(row.data, row.goal);
  const date = String(row.data.date ?? "");
  acc.figures = addAdsFigures(acc.figures, figures);
  acc.channels.set(
    row.channel,
    addAdsFigures(
      acc.channels.get(row.channel) ?? emptyReportFigures(),
      figures,
    ),
  );
  acc.days.set(
    date,
    addAdsFigures(acc.days.get(date) ?? emptyReportFigures(), figures),
  );
  addToCampaign(acc, row, figures);
}

/** The accumulator as a period scope: channels and campaigns by spend. */
export function finishScope(acc: ScopeAccumulator): ReportPeriodScope {
  return {
    figures: acc.figures,
    channels: [...acc.channels]
      .map(([channel, figures]) => ({ channel, figures }))
      .sort((a, b) => b.figures.spend - a.figures.spend),
    daily: [...acc.days]
      .filter(([date]) => date !== "")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, figures]) => ({ date, figures })),
    campaigns: [...acc.campaigns.values()].sort(
      (a, b) => b.figures.spend - a.figures.spend,
    ),
  };
}

/**
 * What one row adds, as summarizeDashboardGoals counts it: delivery and spend
 * always, results only those its goal is measured on (adsRowOutcomes).
 */
function adsRowFigures(
  data: Record<string, unknown>,
  goal: ReportCampaignGoal,
): ReportFigures {
  const outcomes = adsRowOutcomes(data, goal);
  return {
    ...emptyReportFigures(),
    spend: getSpendFromData(data),
    impressions: Number(data.impressions) || 0,
    clicks: Number(data.clicks) || 0,
    ...outcomes,
    // A sales row that carries the field tracks add-to-cart, even at 0;
    // Google Ads rows never carry it.
    addToCartTracked: goal === "ecommerce" && hasAddToCartMetric(data),
  };
}

/** Adds the row to its campaign, marked on or off by the reports' rule. */
function addToCampaign(
  acc: ScopeAccumulator,
  row: GoalAdsRow,
  figures: ReportFigures,
) {
  const key = reportCampaignRowKey(row.tableId, row.data);
  const campaign = acc.campaigns.get(key) ?? {
    key,
    name: String(row.data.campaign_name || reportCampaignKey(row.data)),
    channel: row.channel,
    on: !row.off,
    figures: emptyReportFigures(),
  };
  campaign.figures = addAdsFigures(campaign.figures, figures);
  acc.campaigns.set(key, campaign);
}

/** A campaign's key in the report: its table and campaign. */
export function reportCampaignRowKey(
  tableId: string,
  data: Record<string, unknown>,
): string {
  return `${tableId}:${reportCampaignKey(data)}`;
}
