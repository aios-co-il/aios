import {
  googlePreviousPeriod,
  googleRecordMetrics,
} from "@/components/dynamic-tables/GoogleAdsGoalTable/googlePreviousPeriod";
import { googleGoalSections } from "@/components/dynamic-tables/googleGoalSections";
import {
  type AdsEntityLevel,
  getEntityDisplayName,
  getEntityGroupKey,
} from "@/lib/adsEntityLevel";
import {
  applyCampaignOffRule,
  campaignOffKeys,
  reportOffLookup,
} from "@/lib/campaignOffState";
import { googleCampaignGoalOf } from "@/lib/googleCampaignGoals";
import { googleReportFallbackGoal } from "@/lib/googleGoalPresence";
import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";
import type { AdsReportRecord, AdsReportTable } from "./adsGoalTablesTypes";

/** One entity (campaign, ad set or ad) of a Google Ads report, summed over the period. */
type GoogleEntityRow = {
  key: string;
  name: string;
  goal: GoogleReportGoal;
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  conversions_value: number;
  all_conversions_value: number;
  /** A sales campaign's leads, apart from its purchases. */
  leads: number;
};

/** Spend, conversions and value over every goal, for the notes around the tables. */
export type GoogleReportTotals = {
  cost: number;
  conversions: number;
  conversions_value: number;
  all_conversions_value: number;
};

/**
 * A Google Ads report's entities at one level, one table per campaign goal,
 * with the totals over every goal. A campaign that is off shows only when it
 * spent.
 */
export function googleGoalReport(
  records: Array<AdsReportRecord>,
  table: AdsReportTable,
  level: AdsEntityLevel,
) {
  const fallbackGoal = googleReportFallbackGoal([table]);
  const goalOf = googleGoalOf(records, table, fallbackGoal);
  const rows = Object.values(groupEntities(records, level, goalOf));
  const shown = applyCampaignOffRule(rows, {
    keyOf: (row) => row.key,
    spendOf: (row) => row.cost,
    offKeys: campaignOffKeys(
      records,
      (data) => getEntityGroupKey(data, level),
      reportOffLookup([table]),
    ),
  });
  return {
    fallbackGoal,
    totals: sumTotals(rows),
    ...googleGoalSections(shown, fallbackGoal),
  };
}

/** The previous period per goal table, with goals read from its own rows. */
export function googlePreviousReport(
  previousRecords: Array<AdsReportRecord>,
  table: AdsReportTable,
  level: AdsEntityLevel,
) {
  const fallbackGoal = googleReportFallbackGoal([table]);
  return googlePreviousPeriod(
    previousRecords,
    level,
    googleGoalOf(previousRecords, table, fallbackGoal),
  );
}

/** Each row's campaign goal by the pulse rules, with the table's goal where none applies. */
function googleGoalOf(
  records: Array<AdsReportRecord>,
  table: AdsReportTable,
  fallbackGoal: ReturnType<typeof googleReportFallbackGoal>,
) {
  return googleCampaignGoalOf(
    records.map((record) => ({ table_id: table.id, data: record.data })),
    [table],
    fallbackGoal,
  ).goalOf;
}

/** The report's rows summed per entity at the level. */
function groupEntities(
  records: Array<AdsReportRecord>,
  level: AdsEntityLevel,
  goalOf: (data: Record<string, unknown>) => GoogleReportGoal,
): Record<string, GoogleEntityRow> {
  const groups: Record<string, GoogleEntityRow> = {};
  for (const record of records) {
    const key = getEntityGroupKey(record.data, level);
    groups[key] ??= {
      key,
      name: getEntityDisplayName(record.data, level),
      goal: goalOf(record.data),
      impressions: 0,
      clicks: 0,
      conversions: 0,
      cost: 0,
      conversions_value: 0,
      all_conversions_value: 0,
      leads: 0,
    };
    const group = groups[key];
    const metrics = googleRecordMetrics(record.data);
    group.impressions += metrics.impressions;
    group.clicks += metrics.clicks;
    group.conversions += metrics.conversions;
    group.cost += metrics.cost;
    group.conversions_value += metrics.conversions_value;
    group.all_conversions_value +=
      Number(record.data?.all_conversions_value) || 0;
    group.leads += Number(record.data?.leads) || 0;
  }
  return groups;
}

/** The totals over every entity, switched-off ones included. */
function sumTotals(rows: Array<GoogleEntityRow>): GoogleReportTotals {
  return rows.reduce(
    (acc, row) => ({
      cost: acc.cost + row.cost,
      conversions: acc.conversions + row.conversions,
      conversions_value: acc.conversions_value + row.conversions_value,
      all_conversions_value:
        acc.all_conversions_value + row.all_conversions_value,
    }),
    { cost: 0, conversions: 0, conversions_value: 0, all_conversions_value: 0 },
  );
}
