import type { DashboardAdsRecord } from "@/lib/dashboardCampaignGoals";
import {
  REPORT_GOAL_TABLES,
  TODAY,
  TODAY_RECORDS,
} from "../../supabase/functions/_shared/pulse/report-goal-fixtures.ts";

// Report tables and campaign rows the dashboard parity test reads: the
// pulse's Production-shaped rows plus a mixed account, a Facebook Ecommerce
// table, two Facebook accounts of one client and a Google Ads lead table.

export type Table = {
  id: string;
  client_id: string;
  integration_type: string;
  integration_settings: Record<string, unknown>;
  category?: string;
};
export type Row = { table_id: string; data: Record<string, unknown> };

const DAYS = ["2026-10-30", "2026-11-02", "2026-11-05"];

/** A report table with its campaigns' campaign-level rows on three days. */
function reportTable(table: Table, campaigns: Array<Record<string, unknown>>) {
  const rows = campaigns.flatMap((campaign) =>
    DAYS.map((date) => ({
      table_id: table.id,
      data: { date, entity_level: "campaign", ...campaign },
    })),
  );
  return { table, rows };
}

const MIXED = reportTable(
  {
    id: "t-mixed",
    client_id: "mixed",
    integration_type: "facebook_insights",
    integration_settings: {},
  },
  [
    {
      campaign_id: "m-sale",
      campaign_name: "מכירות",
      campaign_objective: "OUTCOME_SALES",
      spend: 50,
      purchases: 2,
      leads: 1,
    },
    {
      campaign_id: "m-wa",
      campaign_name: "ווטסאפ",
      campaign_objective: "OUTCOME_ENGAGEMENT",
      optimization_goal: "CONVERSATIONS",
      spend: 30,
      conversations: 4,
    },
    {
      campaign_id: "m-cart",
      campaign_name: "עגלה",
      result_kind: "add_to_cart",
      spend: 20,
      add_to_cart: 5,
    },
    {
      campaign_id: "m-video",
      campaign_name: "סרטונים",
      campaign_objective: "OUTCOME_ENGAGEMENT",
      optimization_goal: "THRUPLAY",
      spend: 10,
    },
  ],
);

/** A Facebook Ecommerce table: its campaigns are judged one by one too. */
const ECOMMERCE = reportTable(
  {
    id: "t-fb-ecom",
    client_id: "fb-ecom",
    integration_type: "facebook_ecommerce",
    integration_settings: {},
  },
  [
    {
      campaign_id: "e-sale",
      campaign_name: "מכירות אוגוסט",
      campaign_type: "ecommerce",
      spend: 572,
      purchases: 6,
      purchase_value: 2903,
    },
    {
      campaign_id: "e-jobs",
      campaign_name: "לידים דרושים",
      campaign_type: "lead",
      spend: 400,
      leads: 36,
    },
    {
      campaign_id: "e-traffic",
      campaign_name: "תנועה אוגוסט",
      campaign_type: "traffic",
      spend: 539,
    },
    {
      campaign_id: "e-other",
      campaign_name: "מודעות פתחנו",
      campaign_type: "other",
      spend: 280,
      leads: 3,
    },
  ],
);

/** Two Facebook accounts of one client, one of them set to leads only. */
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
