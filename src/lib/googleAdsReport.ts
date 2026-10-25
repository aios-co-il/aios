import {
  googleReportCampaignGoals,
  googleReportCampaignKey,
  type GoogleReportCampaignGoal,
} from "@/lib/pulseCampaignGoals";

export type GoogleAdsCampaignSummaryRow = {
  name: string;
  campaign_id: string;
  goal: GoogleReportCampaignGoal;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversions_value: number;
};

export type GoogleAdsTotals = Omit<
  GoogleAdsCampaignSummaryRow,
  "name" | "campaign_id" | "goal"
>;

export type GoogleAdsCampaignSummary = {
  campaigns: GoogleAdsCampaignSummaryRow[];
  totals: GoogleAdsTotals;
  ecommerce: GoogleAdsTotals;
  leads: GoogleAdsTotals;
  hasEcommerce: boolean;
  hasLeads: boolean;
};

type ReportRecord = {
  table_id?: string;
  _tableId?: string;
  /** Shared dashboards also send the table's settings on each record. */
  _integrationSettings?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
};
type ReportTable = {
  id: string;
  integration_type?: string | null;
  integration_settings?: Record<string, unknown> | null;
  category?: string | null;
};

const emptyTotals = (): GoogleAdsTotals => ({
  impressions: 0,
  clicks: 0,
  spend: 0,
  conversions: 0,
  conversions_value: 0,
});

function addTotals(target: GoogleAdsTotals, row: GoogleAdsTotals) {
  target.impressions += row.impressions;
  target.clicks += row.clicks;
  target.spend += row.spend;
  target.conversions += row.conversions;
  target.conversions_value += row.conversions_value;
}

/**
 * Goal of each Google Ads campaign in these records, keyed by campaign id (name
 * when missing). A record without a table id is classified with the only Google
 * table, or with the settings it carries (shared dashboards).
 */
export function googleCampaignGoalsForRecords(
  records: ReportRecord[],
  tables: ReportTable[],
): Map<string, GoogleReportCampaignGoal> {
  const allTables = [...tables];
  const googleTables = tables.filter(
    (table) => table.integration_type === "google_ads",
  );
  const withTable = records.map((record, index) => {
    let tableId = record.table_id ?? record._tableId;
    if (!tableId && googleTables.length === 1 && !record._integrationSettings)
      tableId = googleTables[0].id;
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
  return googleReportCampaignGoals({ records: withTable, tables: allTables });
}

/**
 * Google Ads campaigns of a report with each campaign's own goal (ecommerce or
 * leads), decided by the same rules as the pulse check. One account can run both,
 * so totals are kept per goal: purchases and ROAS only from ecommerce campaigns,
 * conversions and cost per conversion only from lead campaigns.
 */
export function summarizeGoogleAdsCampaigns(
  records: ReportRecord[],
  tables: ReportTable[],
): GoogleAdsCampaignSummary {
  const goals = googleCampaignGoalsForRecords(records, tables);
  const fallbackGoal: GoogleReportCampaignGoal = tables.some(
    (table) =>
      table.integration_type === "google_ads" &&
      table.integration_settings?.campaign_type === "ecommerce",
  )
    ? "ecommerce"
    : "leads";

  const map = new Map<string, GoogleAdsCampaignSummaryRow>();
  for (const record of records) {
    const data = record.data || {};
    const name = String(data.campaign_name || data.campaign || "ללא שם");
    const key = String(data.campaign_id || name);
    let row = map.get(key);
    if (!row) {
      row = {
        name,
        campaign_id: String(data.campaign_id || ""),
        goal: goals.get(googleReportCampaignKey(data)) ?? fallbackGoal,
        ...emptyTotals(),
      };
      map.set(key, row);
    }
    row.impressions += Number(data.impressions) || 0;
    row.clicks += Number(data.clicks) || 0;
    row.spend += Number(data.cost) || Number(data.spend) || 0;
    row.conversions += Number(data.conversions) || 0;
    row.conversions_value += Number(data.conversions_value) || 0;
  }

  const campaigns = [...map.values()].sort((a, b) => b.spend - a.spend);
  const totals = emptyTotals();
  const ecommerce = emptyTotals();
  const leads = emptyTotals();
  for (const row of campaigns) {
    addTotals(totals, row);
    addTotals(row.goal === "ecommerce" ? ecommerce : leads, row);
  }
  const hasEcommerce = campaigns.length
    ? campaigns.some((row) => row.goal === "ecommerce")
    : fallbackGoal === "ecommerce";
  const hasLeads = campaigns.length
    ? campaigns.some((row) => row.goal === "leads")
    : fallbackGoal === "leads";
  return { campaigns, totals, ecommerce, leads, hasEcommerce, hasLeads };
}
