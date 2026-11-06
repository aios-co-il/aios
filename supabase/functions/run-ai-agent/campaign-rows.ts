/**
 * get_facebook_campaign_data's campaign rows with each campaign's report goal
 * and result count (reportCampaignGoalOf, goalResultCount, adsRowOutcomes), so
 * Carmen quotes the leads or purchases the client's report shows. Live Meta
 * rows are built like the stored ones (readCampaignDays), so both paths count
 * the same way.
 */
import { getSpendFromData } from "../_shared/campaign-goal/ads-metrics.ts";
import {
  reportCampaignGoalOf,
  reportCampaignKey,
  type CampaignGoalRecord,
  type CampaignGoalTable,
} from "../_shared/campaign-goal/campaign-goals.ts";
import {
  adsRowOutcomes,
  goalResultCount,
} from "../_shared/campaign-goal/outcomes.ts";
import type { ReportCampaignGoal } from "../_shared/campaign-goal/report-goals.ts";

type Goal = ReportCampaignGoal | undefined;

/** What rows count toward their campaign's report goal. */
type Counted = {
  results: number | null;
  leads: number;
  purchases: number;
  revenue: number;
};

/** What one row counts: a row of a table with no report goal counts everything and no result. */
function countRow(data: Record<string, unknown>, goal: Goal): Counted {
  const outcomes = adsRowOutcomes(data, goal);
  return {
    results: goal ? goalResultCount(data, goal) : null,
    leads: outcomes.leads,
    purchases: outcomes.purchases,
    revenue: outcomes.revenue,
  };
}

/**
 * The tool's result fields: leads only for a lead campaign, purchases and
 * revenue only for a sales campaign, neither for traffic. A row of a table
 * with no report goal (neither Meta nor Google Ads) keeps both.
 */
function resultFields(goal: Goal, spend: number, counted: Counted) {
  const leads =
    goal === undefined || goal === "leads" ? round(counted.leads) : null;
  const purchases =
    goal === undefined || goal === "ecommerce"
      ? round(counted.purchases)
      : null;
  return {
    goal: goal ?? null,
    results: counted.results === null ? null : round(counted.results),
    leads_count: leads,
    purchases,
    revenue: purchases === null ? null : round(counted.revenue),
    cost_per_lead: leads ? round(spend / leads) : null,
  };
}

/**
 * The stored rows (campaign level, newest first, at most `limit`) with each
 * row's report goal, taken over every row passed.
 */
export function storedCampaignRows(
  records: CampaignGoalRecord[],
  tables: CampaignGoalTable[],
  limit = 500,
) {
  const verdictOf = reportCampaignGoalOf(records, tables);
  return records
    .filter((record) => record.data?.date)
    .sort((a, b) =>
      String(b.data?.date ?? "").localeCompare(String(a.data?.date ?? "")),
    )
    .slice(0, limit)
    .map((record) => {
      const d = record.data ?? {};
      const goal = verdictOf(record)?.goal;
      return {
        campaign_id: d.campaign_id ?? null,
        campaign_name: d.campaign_name ?? null,
        date: d.date ?? null,
        impressions: d.impressions ?? null,
        clicks: d.clicks ?? null,
        spend: d.spend ?? d.cost ?? null,
        ...resultFields(goal, getSpendFromData(d), countRow(d, goal)),
        reach: d.reach ?? null,
        cpc: d.cpc ?? null,
        cpm: d.cpm ?? null,
        ctr: d.ctr ?? null,
        campaign_status:
          d.effective_status ?? d.campaign_status ?? d.configured_status ?? null,
      };
    });
}

/**
 * Live Meta campaign × day rows summed per campaign over the window, each
 * campaign judged as `table`'s report judges the same rows. Reach is not
 * additive over days, so it is left out.
 */
export function liveCampaignRows(
  rows: Array<{ data: Record<string, unknown> }>,
  table: CampaignGoalTable,
) {
  const records = rows.map((row) => ({ table_id: table.id, data: row.data }));
  const verdictOf = reportCampaignGoalOf(records, [table]);
  const byCampaign = new Map<string, CampaignGoalRecord[]>();
  for (const record of records) {
    const key = reportCampaignKey(record.data);
    byCampaign.set(key, [...(byCampaign.get(key) ?? []), record]);
  }
  return [...byCampaign.values()]
    .map((campaignRecords) =>
      liveCampaignRow(campaignRecords, verdictOf(campaignRecords[0])?.goal),
    )
    .sort((a, b) => b.spend - a.spend);
}

/** One campaign's window totals from its day rows. */
function liveCampaignRow(records: CampaignGoalRecord[], goal: Goal) {
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  const counted: Counted = {
    results: goal && goal !== "traffic" ? 0 : null,
    leads: 0,
    purchases: 0,
    revenue: 0,
  };
  let latest: Record<string, unknown> = {};
  for (const record of records) {
    const data = record.data ?? {};
    spend += getSpendFromData(data);
    impressions += Number(data.impressions) || 0;
    clicks += Number(data.clicks) || 0;
    const row = countRow(data, goal);
    if (counted.results !== null) {
      counted.results += row.results ?? 0;
    }
    counted.leads += row.leads;
    counted.purchases += row.purchases;
    counted.revenue += row.revenue;
    if (String(data.date ?? "") >= String(latest.date ?? "")) {
      latest = data;
    }
  }
  return {
    campaign_id: latest.campaign_id ?? null,
    campaign_name: latest.campaign_name ?? null,
    campaign_status: latest.effective_status ?? null,
    impressions,
    clicks,
    spend: round(spend),
    ...resultFields(goal, spend, counted),
    cpc: clicks > 0 ? round(spend / clicks) : null,
    cpm: impressions > 0 ? round((spend / impressions) * 1000) : null,
    ctr: impressions > 0 ? round((clicks / impressions) * 100) : null,
  };
}

/**
 * The last `days` full days before `now` (UTC dates, ending yesterday), the
 * span Meta's last_N_days presets cover.
 */
export function liveCampaignWindow(
  days: number,
  now: Date,
): { start: string; end: string } {
  const count = Math.max(1, Math.floor(Number(days)) || 1);
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (count - 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
