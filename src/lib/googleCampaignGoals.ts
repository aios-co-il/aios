import { classifyPulseCampaignGoal } from "@/lib/pulseCampaignGoals";
import {
  type CampaignGoalVote,
  resolveCampaignGoals,
} from "../../supabase/functions/_shared/pulse/resolve-campaign-goals.ts";

export type GoogleReportCampaignGoal = "ecommerce" | "leads";

/** The fields of a Google Ads report row's `data` that reports read, as the sync writes them. */
export type GoogleAdsRowData = {
  campaign_id?: string;
  campaign_name?: string;
  campaign?: string;
  impressions?: number;
  clicks?: number;
  cost?: number;
  spend?: number;
  conversions?: number;
  conversions_value?: number;
  conversion_goal?: GoogleReportCampaignGoal;
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

export type GoogleCampaignGoalLookup = {
  goalOf: (data?: GoogleAdsRowData | null) => GoogleReportCampaignGoal;
  hasEcommerce: boolean;
  hasLeads: boolean;
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
  fallback: GoogleReportCampaignGoal,
): GoogleCampaignGoalLookup {
  const goals = googleCampaignGoalsForRecords(records, tables);
  const goalOf = (data?: GoogleAdsRowData | null) =>
    goals.get(googleReportCampaignKey(data)) ?? fallback;
  const recordGoals = new Set(records.map((record) => goalOf(record.data)));
  return {
    goalOf,
    hasEcommerce: records.length
      ? recordGoals.has("ecommerce")
      : fallback === "ecommerce",
    hasLeads: records.length ? recordGoals.has("leads") : fallback === "leads",
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
): Map<string, GoogleReportCampaignGoal> {
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
): Map<string, GoogleReportCampaignGoal> {
  const tableMap = new Map(tables.map((table) => [table.id, table]));
  const votes: CampaignGoalVote[] = [];
  for (const record of records) {
    const data = record.data || {};
    const table = tableMap.get(record.table_id);
    if (!table || table.integration_type !== "google_ads") {
      continue;
    }
    const key = googleReportCampaignKey(data);
    if (!key) {
      continue;
    }
    const classification = classifyPulseCampaignGoal(data, {
      integration_type: table.integration_type,
      integration_settings: table.integration_settings || {},
      category: table.category,
    });
    votes.push({
      key,
      goal: classification.goal,
      source: classification.source,
      spend: data.spend ?? data.cost ?? 0,
    });
  }
  const result = new Map<string, GoogleReportCampaignGoal>();
  for (const [key, goal] of resolveCampaignGoals(votes)) {
    result.set(key, goal === "ecommerce" ? "ecommerce" : "leads");
  }
  return result;
}

/** The key a Google Ads campaign's goal is stored under: its id, else its name. */
export function googleReportCampaignKey(
  data?: GoogleAdsRowData | null,
): string {
  return data?.campaign_id || data?.campaign_name || "";
}
