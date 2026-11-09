import {
  classifyGoogleCampaignRow,
  type GoogleCampaignGoal,
  type GoogleReportGoal,
} from "./google-classify.ts";
import {
  googleGoalPresence,
  type GoogleGoalPresence,
} from "./google-presence.ts";
import {
  type CampaignGoalVote,
  resolveCampaignGoalVotes,
  voteSpend,
} from "./goal-vote.ts";

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
  /** A sales campaign's leads (calls, forms), apart from its purchases. */
  leads?: number | string;
  conversion_goal?: GoogleCampaignGoal;
  /** Google's campaign type and bid strategy; exposure bidding makes traffic (AIO-496). */
  campaign_channel_type?: string;
  bidding_strategy_type?: string;
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
  /** The report's on/off switch; off marks its campaigns "כבוי". */
  campaign_active?: boolean | null;
};

export type GoogleCampaignGoalLookup = GoogleGoalPresence & {
  goalOf: (data?: GoogleAdsRowData | null) => GoogleReportGoal;
};

/** A Google campaign's goal and the strongest signal behind it. */
export type GoogleCampaignGoalVerdict = {
  goal: GoogleReportGoal;
  /** platform_goal, explicit_mapping or table_report_type. */
  source: string;
};

/**
 * Goal of each Google Ads campaign in a report: one account can run ecommerce
 * and lead campaigns side by side, and the pulse judges each campaign by the
 * same goal. `fallback` covers rows the rules cannot key and reports with no
 * rows.
 */
export function googleCampaignGoalOf(
  records: Array<GoogleReportRecord>,
  tables: Array<GoogleReportTable>,
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
  records: Array<GoogleReportRecord>,
  tables: Array<GoogleReportTable>,
): Map<string, GoogleReportGoal> {
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
 * Goal per Google Ads campaign of records whose table is known; engagement
 * (a name or override hint) shows as leads (conversions), and a campaign set
 * to pay for exposure as traffic. The strongest signal across a campaign's
 * rows wins.
 */
export function googleReportCampaignGoals(
  records: Array<{ table_id: string; data?: GoogleAdsRowData | null }>,
  tables: Array<GoogleReportTable>,
): Map<string, GoogleReportGoal> {
  const result = new Map<string, GoogleReportGoal>();
  for (const [key, verdict] of googleReportCampaignVerdicts(records, tables)) {
    result.set(key, verdict.goal);
  }
  return result;
}

/** googleReportCampaignGoals with the strongest signal behind each goal. */
export function googleReportCampaignVerdicts(
  records: Array<{ table_id: string; data?: Record<string, unknown> | null }>,
  tables: Array<GoogleReportTable>,
): Map<string, GoogleCampaignGoalVerdict> {
  const tableMap = new Map(tables.map((table) => [table.id, table]));
  const votes: Array<CampaignGoalVote> = [];
  for (const record of records) {
    const data = record.data || {};
    const table = tableMap.get(record.table_id);
    const key = googleReportCampaignKey(data);
    if (table?.integration_type !== "google_ads" || !key) {
      continue;
    }
    const { goal, source } = classifyGoogleCampaignRow(data, table);
    votes.push({ key, goal, source, spend: voteSpend(data) });
  }
  const result = new Map<string, GoogleCampaignGoalVerdict>();
  for (const [key, { goal, source }] of resolveCampaignGoalVotes(votes)) {
    result.set(key, { goal: reportGoalOf(goal), source });
  }
  return result;
}

/** The report goal of a resolved vote: engagement folds into leads, as before AIO-496. */
function reportGoalOf(goal: string): GoogleReportGoal {
  if (goal === "ecommerce" || goal === "traffic") {
    return goal;
  }
  return "leads";
}

/** The key a Google Ads campaign's goal is stored under: its id, else its name. */
export function googleReportCampaignKey(
  data?: Record<string, unknown> | null,
): string {
  return String(data?.campaign_id || data?.campaign_name || "");
}
