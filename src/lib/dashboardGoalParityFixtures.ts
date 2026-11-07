import type { DashboardAdsRecord } from "@/lib/dashboardCampaignGoals";
import {
  REPORT_GOAL_TABLES,
  TODAY,
  TODAY_RECORDS,
} from "../../supabase/functions/_shared/pulse/report-goal-fixtures.ts";
import {
  ECOMMERCE,
  MIXED,
  reportTable,
  type Row,
  type Table,
} from "@/lib/dashboardGoalParityTables";

// Report tables and campaign rows the dashboard parity test reads: the
// pulse's Production-shaped rows plus a mixed account, a Facebook Ecommerce
// table, two Facebook accounts of one client and a Google Ads lead table.

const TWO_ACCOUNTS_LEADS = reportTable(
  {
    id: "t-two-leads",
    client_id: "two-accounts",
    integration_type: "facebook_insights",
    integration_settings: { campaign_type: "leads" },
  },
  [
    {
      campaign_id: "a-sale",
      campaign_name: "מכירות בטבלת לידים",
      campaign_objective: "OUTCOME_SALES",
      spend: 40,
      purchases: 1,
      leads: 2,
    },
  ],
);
const TWO_ACCOUNTS_MIXED = reportTable(
  {
    id: "t-two-mixed",
    client_id: "two-accounts",
    integration_type: "facebook_insights",
    integration_settings: {},
  },
  [
    {
      campaign_id: "b-sale",
      campaign_name: "מכירות בחשבון השני",
      campaign_objective: "OUTCOME_SALES",
      spend: 60,
      purchases: 3,
    },
  ],
);

const GOOGLE_LEADS = reportTable(
  {
    id: "t-google-leads",
    client_id: "google-leads",
    integration_type: "google_ads",
    integration_settings: { campaign_type: "leads" },
    category: "Google Ads",
  },
  [
    {
      campaign_id: "g-search",
      campaign_name: "חיפוש",
      cost: 60,
      conversions: 2,
      conversions_value: 2,
    },
    {
      campaign_id: "g-pmax",
      campaign_name: "PMax",
      conversion_goal: "ecommerce",
      cost: 90,
      conversions: 1,
      conversions_value: 400,
    },
    {
      campaign_id: "g-display",
      campaign_name: "באנרים",
      campaign_channel_type: "DISPLAY",
      bidding_strategy_type: "MANUAL_CPM",
      cost: 30,
      conversions: 0,
    },
  ],
);

const EXTRA = [
  MIXED,
  ECOMMERCE,
  TWO_ACCOUNTS_LEADS,
  TWO_ACCOUNTS_MIXED,
  GOOGLE_LEADS,
];
export const TABLES: Array<Table> = [
  ...REPORT_GOAL_TABLES,
  ...EXTRA.map((extra) => extra.table),
];
export const RECORDS: Array<Row> = [
  ...TODAY_RECORDS.filter((row) => String(row.data.date) < TODAY),
  ...EXTRA.flatMap((extra) => extra.rows),
];

/** A client's records as a dashboard tags them: source and table on each. */
export function dashboardRecords(clientId: string): Array<DashboardAdsRecord> {
  const tableOf = new Map(TABLES.map((table) => [table.id, table]));
  return RECORDS.filter(
    (row) => tableOf.get(row.table_id)?.client_id === clientId,
  ).map((row) => ({
    _source: tableOf.get(row.table_id)?.integration_type,
    _tableId: row.table_id,
    data: row.data,
  }));
}

/** Every client with a report table. */
export const CLIENTS = [...new Set(TABLES.map((table) => table.client_id))];
