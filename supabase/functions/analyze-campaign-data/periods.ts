/**
 * analyze-campaign-data's numbers around each event date. Leads and cost per
 * lead are the report's: each row counts toward its campaign's report goal
 * (reportCampaignGoalOf, adsRowOutcomes), so a sales campaign's stray leads or
 * a Google sales campaign's conversions are not leads, and a WhatsApp
 * campaign's conversations are.
 */
import { getSpendFromData } from "../_shared/campaign-goal/ads-metrics.ts";
import {
  reportCampaignGoalOf,
  type CampaignGoalRecord,
  type CampaignGoalTable,
} from "../_shared/campaign-goal/campaign-goals.ts";
import { adsRowOutcomes } from "../_shared/campaign-goal/outcomes.ts";
import type { ReportCampaignGoal } from "../_shared/campaign-goal/report-goals.ts";

export interface EventPeriod {
  eventDate: string;
  startDate: string;
  endDate: string;
  metrics: {
    totalSpend: number;
    totalLeads: number;
    avgCostPerLead: number;
    avgCtr: number;
    avgCpm: number;
    totalClicks: number;
    totalImpressions: number;
    campaigns: string[];
  };
}

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

/** One event's window: `daysBeforeEvent` days up to the event date. */
export type PeriodWindow = {
  /** The date as the user typed it ("D.M"), the period's key. */
  eventDate: string;
  startDate: string;
  endDate: string;
};

/**
 * The window of each "D.M" (or "DD.MM") event date; a month after the current
 * one is last year's. Dates that do not parse are skipped.
 */
export function eventPeriodWindows(
  eventDates: string[],
  daysBeforeEvent: number,
  now: Date,
): PeriodWindow[] {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const windows: PeriodWindow[] = [];
  for (const dateStr of eventDates) {
    const parts = dateStr.trim().split(".");
    if (parts.length !== 2) continue;
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    if (isNaN(day) || isNaN(month)) continue;
    const year = month > currentMonth ? currentYear - 1 : currentYear;
    const eventDate = new Date(year, month - 1, day);
    const startDate = new Date(eventDate);
    startDate.setDate(startDate.getDate() - daysBeforeEvent);
    windows.push({
      eventDate: dateStr.trim(),
      startDate: startDate.toISOString().split("T")[0],
      endDate: eventDate.toISOString().split("T")[0],
    });
  }
  return windows;
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

/**
 * Each window's totals and, with `byCampaign`, each campaign's row. `records`
 * are the table's campaign-level rows; each window's goals are the report's
 * over that window's rows.
 */
export function analyzePeriods(input: {
  records: CampaignGoalRecord[];
  table: CampaignGoalTable | null;
  windows: PeriodWindow[];
  campaignFilter?: string;
  byCampaign: boolean;
}): { eventPeriods: EventPeriod[]; campaignPeriodData: CampaignPeriodData[] } {
  const eventPeriods: EventPeriod[] = [];
  const campaignPeriodData: CampaignPeriodData[] = [];
  const filter = input.campaignFilter?.toLowerCase();
  for (const window of input.windows) {
    const periodRecords = input.records.filter((record) => {
      const recordDate = record.data?.date;
      if (!recordDate) return false;
      if (filter) {
        const campaignName = String(
          record.data?.campaign_name || "",
        ).toLowerCase();
        if (!campaignName.includes(filter)) return false;
      }
      return (
        String(recordDate) >= window.startDate &&
        String(recordDate) <= window.endDate
      );
    });
    const verdictOf = reportCampaignGoalOf(
      periodRecords,
      input.table ? [input.table] : [],
    );
    if (input.byCampaign) {
      campaignPeriodData.push(
        ...campaignRows(periodRecords, verdictOf, window.eventDate),
      );
    }
    eventPeriods.push(periodTotals(periodRecords, verdictOf, window));
  }
  return { eventPeriods, campaignPeriodData };
}

type VerdictOf = ReturnType<typeof reportCampaignGoalOf>;

/** One row per campaign name in the window. */
function campaignRows(
  periodRecords: CampaignGoalRecord[],
  verdictOf: VerdictOf,
  eventDate: string,
): CampaignPeriodData[] {
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

  const rows: CampaignPeriodData[] = [];
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

/** The window's totals; cost per lead uses only lead campaigns' spend, as the report's leads table. */
function periodTotals(
  periodRecords: CampaignGoalRecord[],
  verdictOf: VerdictOf,
  window: PeriodWindow,
): EventPeriod {
  let totalSpend = 0;
  let leadSpend = 0;
  let totalLeads = 0;
  let totalClicks = 0;
  let totalImpressions = 0;
  let ctrSum = 0;
  let cpmSum = 0;
  let ctrCount = 0;
  let cpmCount = 0;
  const campaigns = new Set<string>();

  for (const record of periodRecords) {
    const data = record.data ?? {};
    const goal = verdictOf(record)?.goal;
    const spend = getSpendFromData(data);
    totalSpend += spend;
    if (goal === undefined || goal === "leads") {
      leadSpend += spend;
    }
    totalLeads += adsRowOutcomes(data, goal).leads;
    totalClicks += parseInt(String(data.clicks)) || 0;
    totalImpressions += parseInt(String(data.impressions)) || 0;
    if (data.ctr) {
      ctrSum += parseFloat(String(data.ctr));
      ctrCount++;
    }
    if (data.cpm) {
      cpmSum += parseFloat(String(data.cpm));
      cpmCount++;
    }
    if (data.campaign_name) {
      campaigns.add(String(data.campaign_name));
    }
  }

  const avgCostPerLead = totalLeads > 0 ? leadSpend / totalLeads : 0;
  const avgCtr = ctrCount > 0 ? ctrSum / ctrCount : 0;
  const avgCpm = cpmCount > 0 ? cpmSum / cpmCount : 0;
  return {
    eventDate: window.eventDate,
    startDate: window.startDate,
    endDate: window.endDate,
    metrics: {
      totalSpend: round(totalSpend),
      totalLeads: round(totalLeads),
      avgCostPerLead: round(avgCostPerLead),
      avgCtr: round(avgCtr),
      avgCpm: round(avgCpm),
      totalClicks,
      totalImpressions,
      campaigns: Array.from(campaigns),
    },
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
