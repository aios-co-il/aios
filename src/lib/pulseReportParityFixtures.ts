// Report and pulse parity fixtures: the Production-shaped rows of the
// 2026-11-06 pulse run plus a mixed Meta account, a leads-only Meta table and
// a Google leads table, on the 7 full days before TODAY.
import {
  REPORT_GOAL_TABLES,
  TODAY,
  TODAY_RECORDS,
} from "../../supabase/functions/_shared/pulse/report-goal-fixtures.ts";

export type Row = { table_id: string; data: Record<string, unknown> };
export type Table = (typeof REPORT_GOAL_TABLES)[number];

const FULL_DAYS = (row: Row) => String(row.data.date) < TODAY;

/** One more report table with its campaign rows on the 7 full days. */
function extra(table: Table, campaigns: Array<Record<string, unknown>>) {
  const days = ["2026-10-30", "2026-11-02", "2026-11-05"];
  const rows = campaigns.flatMap((campaign) =>
    days.map((date) => ({
      table_id: table.id,
      data: { date, entity_level: "campaign", ...campaign },
    })),
  );
  return { table, rows };
}

const MIXED = extra(
  {
    id: "t-mixed",
    client_id: "mixed",
    integration_type: "facebook_insights",
    integration_settings: {},
    category: "Facebook Insights",
  },
  [
    {
      campaign_id: "m-sale",
      campaign_name: "מכירות",
      campaign_objective: "OUTCOME_SALES",
      optimization_goal: "OFFSITE_CONVERSIONS",
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
      leads: 0,
    },
    {
      campaign_id: "m-form",
      campaign_name: "טופס",
      campaign_objective: "OUTCOME_LEADS",
      optimization_goal: "LEAD_GENERATION",
      spend: 20,
      form_leads: 3,
      leads: 0,
    },
    {
      campaign_id: "m-video",
      campaign_name: "סרטונים",
      campaign_objective: "OUTCOME_ENGAGEMENT",
      optimization_goal: "THRUPLAY",
      spend: 10,
      video_views: 90,
      conversations: 0,
    },
    {
      campaign_id: "m-legacy",
      campaign_name: "ישן",
      campaign_type: "lead",
      spend: 15,
      leads: 2,
    },
  ],
);

const LEADS_ONLY = extra(
  {
    id: "t-leads-only",
    client_id: "leads-only",
    integration_type: "facebook_insights",
    integration_settings: { campaign_type: "leads" },
    category: "Facebook Insights",
  },
  [
    {
      campaign_id: "lo-sale",
      campaign_name: "מכירות בטבלת לידים",
      campaign_objective: "OUTCOME_SALES",
      spend: 40,
      purchases: 1,
      leads: 2,
    },
  ],
);

const GOOGLE_LEADS = extra(
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
      campaign_id: "g-video",
      campaign_name: "סרטון יוטיוב",
      cost: 25,
      conversions: 0,
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

export const TABLES: Array<Table> = [
  ...REPORT_GOAL_TABLES,
  MIXED.table,
  LEADS_ONLY.table,
  GOOGLE_LEADS.table,
];
export const RECORDS: Array<Row> = [
  ...TODAY_RECORDS.filter(FULL_DAYS),
  ...MIXED.rows,
  ...LEADS_ONLY.rows,
  ...GOOGLE_LEADS.rows,
];
