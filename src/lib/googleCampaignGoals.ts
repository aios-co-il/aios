import {
  googleGoalPresence,
  type GoogleGoalPresence,
} from "@/lib/googleGoalPresence";
import { classifyPulseCampaignGoal } from "@/lib/pulseCampaignGoals";
import type { GoogleCampaignGoal } from "../../supabase/functions/_shared/pulse/google-campaign-goal.ts";
import {
  type CampaignGoalVote,
  resolveCampaignGoals,
  voteSpend,
} from "../../supabase/functions/_shared/pulse/resolve-campaign-goals.ts";

/**
 * The fields of a Google Ads report row's `data` that reports read. Rows written
 * by Make or the webhook can hold numeric ids and numeric strings, so readers
 * parse ids with String() and metrics with Number().
 */
export type GoogleAdsRowData = {
  campaign_id?: string | number;
  campaign_name?: string;
  campaign?: string;
  impressions?: number | string;
  clicks?: number | string;
  cost?: number | string;
  spend?: number | string;
  conversions?: number | string;
  conversions_value?: number | string;
  conversion_goal?: GoogleCampaignGoal;
};

export type GoogleReportRecord = {
  table_id?: string;
  _tableId?: string;
  /** Shared dashboards also send the table's settings on each record. */
  _integrationSettings?: Record<string, unknown> | null;
  data?: GoogleAdsRowData | null;
};

export type GoogleReportTable = {
  id: string;
  integration_type?: string | null;
  integration_settings?: Record<string, unknown> | null;
  category?: string | null;
};

export type GoogleCampaignGoalLookup = GoogleGoalPresence & {
  goalOf: (data?: GoogleAdsRowData | null) => GoogleCampaignGoal;
};

/**
 * Goal of each Google Ads campaign in a report, decided by the pulse check's rules
 * so the report shows a campaign by the goal the pulse measures it on: one account
 * can run ecommerce and lead campaigns side by side. `fallback` covers rows the
 * rules cannot key and reports with no rows.
 */
export function googleCampaignGoalOf(
  records: GoogleReportRecord[],
  tables: GoogleReportTable[],
  fallback: GoogleCampaignGoal,
): GoogleCampaignGoalLookup {
  const goals = googleCampaignGoalsForRecords(records, tables);
  const goalOf = (data?: GoogleAdsRowData | null) =>
    goals.get(googleReportCampaignKey(data)) ?? fallback;
  return {
    goalOf,
    ...googleGoalPresence(
      records.map((record) => goalOf(record.data)),
      fallback,
    ),
  };
}

/**
 * Goal of each Google Ads campaign in these records, keyed by campaign id (name
 * when missing). A record without a table id is classified with the only Google
 * table, or with the settings it carries (shared dashboards).
 */
export function googleCampaignGoalsForRecords(
  records: GoogleReportRecord[],
  tables: GoogleReportTable[],
): Map<string, GoogleCampaignGoal> {
  const allTables = [...tables];
  const googleTables = tables.filter(
    (table) => table.integration_type === "google_ads",
  );
  const withTable = records.map((record, index) => {
    let tableId = record.table_id ?? record._tableId;
    if (!tableId && googleTables.length === 1 && !record._integrationSettings) {
      tableId = googleTables[0].id;
    }
    if (!tableId) {
      tableId = `record-${index}`;
      allTables.push({
        id: tableId,
        integration_type: "google_ads",
        integration_settings: record._integrationSettings || {},
      });
    }
    return { table_id: tableId, data: record.data || {} };
  });
  return googleReportCampaignGoals(withTable, allTables);
}

/**
 * Goal per Google Ads campaign of records whose table is known; engagement shows
 * as leads (conversions). The strongest signal across a campaign's rows wins.
 */
export function googleReportCampaignGoals(
  records: Array<{ table_id: string; data?: GoogleAdsRowData | null }>,
  tables: GoogleReportTable[],
): Map<string, GoogleCampaignGoal> {
  const tableMap = new Map(tables.map((table) => [table.id, table]));
  const votes: CampaignGoalVote[] = [];
  for (const record of records) {
    const data = record.data || {};
    const table = tableMap.get(record.table_id);
    const key = googleReportCampaignKey(data);
    if (table?.integration_type !== "google_ads" || !key) {
      continue;
    }
    const { goal, source } = classifyPulseCampaignGoal(data, {
      integration_type: table.integration_type,
      integration_settings: table.integration_settings || {},
      category: table.category,
    });
    votes.push({ key, goal, source, spend: voteSpend(data) });
  }
  const result = new Map<string, GoogleCampaignGoal>();
  for (const [key, goal] of resolveCampaignGoals(votes)) {
    result.set(key, goal === "ecommerce" ? "ecommerce" : "leads");
  }
  return result;
}

/** The key a Google Ads campaign's goal is stored under: its id, else its name. */
export function googleReportCampaignKey(
  data?: GoogleAdsRowData | null,
): string {
  return String(data?.campaign_id || data?.campaign_name || "");
}
