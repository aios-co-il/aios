import { getSpendFromData } from "@/lib/adsMetrics";
import { shouldIncludeInAdsDashboardAggregate } from "@/lib/adsEntityLevel";
import { adsRowOutcomes } from "@/lib/adsRowOutcomes";
import {
  reportCampaignGoalOf,
  type ReportCampaignGoal,
} from "@/lib/campaignGoals";

export type CampaignRecord = {
  campaignName: string;
  /** The campaign's goal as its report shows it; absent on a totals row. */
  goal?: ReportCampaignGoal;
  impressions: number;
  clicks: number;
  leads: number;
  purchases: number;
  spend: number;
  revenue: number;
};

export type ClientCampaignTableData = {
  clientId: string;
  clientName: string;
  tableId: string;
  tableName: string;
  integrationType: string;
  /** Ecommerce when any of the table's campaigns is a sales campaign. */
  campaignType: "leads" | "ecommerce";
  records: CampaignRecord[];
  totals: CampaignRecord;
};

const emptyTotals = (): CampaignRecord => ({
  campaignName: 'סה"כ',
  impressions: 0,
  clicks: 0,
  leads: 0,
  purchases: 0,
  spend: 0,
  revenue: 0,
});

export const isFacebookIntegration = (
  source: string | null,
): source is "facebook_insights" | "facebook_ecommerce" =>
  source === "facebook_insights" || source === "facebook_ecommerce";

export const isGoogleAdsIntegration = (source: string) =>
  source === "google_ads";

export const isAdsIntegration = (source: string) =>
  isFacebookIntegration(source) || isGoogleAdsIntegration(source);

export type AgencyPlatformFilter = "all" | "facebook" | "google_ads";

export function matchesAgencyPlatformFilter(
  integrationType: string,
  filter: AgencyPlatformFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "facebook") return isFacebookIntegration(integrationType);
  if (filter === "google_ads") return isGoogleAdsIntegration(integrationType);
  return true;
}

type RawCampaignRecord = {
  table_id: string;
  data?: Record<string, unknown>;
};

type CampaignTableMeta = {
  id: string;
  client_id: string;
  name?: string | null;
  integration_type: string;
  integration_settings?: Record<string, unknown> | null;
};

/**
 * Each client table's campaigns in the period. Every campaign takes its goal
 * from its report (reportCampaignGoalOf) and adds only what that goal
 * measures, as the reports count it: purchases and revenue for sales, leads
 * for leads, neither for traffic.
 */
export function buildClientCampaignTableData(input: {
  clients: Array<{ id: string; name: string }>;
  tables: CampaignTableMeta[];
  records: RawCampaignRecord[];
  startDate: string;
  endDate: string;
  platformFilter: AgencyPlatformFilter;
}): ClientCampaignTableData[] {
  const { clients, tables, records, startDate, endDate, platformFilter } =
    input;
  const clientMap = new Map(clients.map((client) => [client.id, client.name]));
  const tableMeta = new Map(tables.map((table) => [table.id, table]));
  const tableDataMap = new Map<string, ClientCampaignTableData>();

  const periodRecords = records.filter((record) => {
    const table = tableMeta.get(record.table_id);
    if (!table?.client_id) return false;
    if (!isAdsIntegration(table.integration_type)) return false;
    if (!matchesAgencyPlatformFilter(table.integration_type, platformFilter))
      return false;
    const data = record.data || {};
    const date = typeof data.date === "string" ? data.date : null;
    if (!date || date < startDate || date > endDate) return false;
    return shouldIncludeInAdsDashboardAggregate(data, table.integration_type);
  });
  const goalOf = reportCampaignGoalOf(periodRecords, tables);

  for (const record of periodRecords) {
    const table = tableMeta.get(record.table_id)!;
    // Every Facebook and Google Ads table gives each of its campaigns a goal.
    const goal = goalOf(record)?.goal;
    if (!goal) continue;

    const data = record.data || {};
    const key = `${table.client_id}-${table.id}`;
    if (!tableDataMap.has(key)) {
      tableDataMap.set(key, {
        clientId: table.client_id,
        clientName: clientMap.get(table.client_id) || "לקוח לא ידוע",
        tableId: table.id,
        tableName: table.name || "",
        integrationType: table.integration_type,
        campaignType: "leads",
        records: [],
        totals: emptyTotals(),
      });
    }

    const tableData = tableDataMap.get(key)!;
    const campaignName = String(
      data.campaign_name || data.campaignName || data.name || "ללא שם",
    );

    let campaignRecord = tableData.records.find(
      (row) => row.campaignName === campaignName && row.goal === goal,
    );
    if (!campaignRecord) {
      campaignRecord = {
        campaignName,
        goal,
        impressions: 0,
        clicks: 0,
        leads: 0,
        purchases: 0,
        spend: 0,
        revenue: 0,
      };
      tableData.records.push(campaignRecord);
    }

    const impressions = Number(data.impressions) || 0;
    const clicks = Number(data.clicks) || 0;
    const { leads, purchases, revenue } = adsRowOutcomes(data, goal);
    const spend = getSpendFromData(data);

    for (const row of [campaignRecord, tableData.totals]) {
      row.impressions += impressions;
      row.clicks += clicks;
      row.leads += leads;
      row.purchases += purchases;
      row.spend += spend;
      row.revenue += revenue;
    }
    if (goal === "ecommerce") tableData.campaignType = "ecommerce";
  }

  return Array.from(tableDataMap.values())
    .filter((row) => row.records.length > 0)
    .sort((a, b) => a.clientName.localeCompare(b.clientName, "he"));
}
