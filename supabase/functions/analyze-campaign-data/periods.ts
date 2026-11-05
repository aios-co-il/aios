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
import {
  campaignRows,
  type CampaignPeriodData,
  type VerdictOf,
} from "./campaign-period-rows.ts";
import type { PeriodWindow } from "./event-windows.ts";

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
    campaigns: Array<string>;
  };
}

/**
 * Each window's totals and, with `byCampaign`, each campaign's row. `records`
 * are the table's campaign-level rows; each window's goals are the report's
 * over that window's rows.
 */
export function analyzePeriods(input: {
  records: Array<CampaignGoalRecord>;
  table: CampaignGoalTable | null;
  windows: Array<PeriodWindow>;
  campaignFilter?: string;
  byCampaign: boolean;
}): {
  eventPeriods: Array<EventPeriod>;
  campaignPeriodData: Array<CampaignPeriodData>;
} {
  const eventPeriods: Array<EventPeriod> = [];
  const campaignPeriodData: Array<CampaignPeriodData> = [];
  const filter = input.campaignFilter?.toLowerCase();
  for (const window of input.windows) {
    const periodRecords = input.records.filter((record) => {
      const recordDate = record.data?.date;
      if (!recordDate) {
        return false;
      }
      if (filter) {
        const campaignName = String(
          record.data?.campaign_name || "",
        ).toLowerCase();
        if (!campaignName.includes(filter)) {
          return false;
        }
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

/** The window's totals; cost per lead uses only lead campaigns' spend, as the report's leads table. */
function periodTotals(
  periodRecords: Array<CampaignGoalRecord>,
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
