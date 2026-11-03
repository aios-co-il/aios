/**
 * The extra report tables the dashboard parity test adds to the pulse's
 * Production-shaped rows: a mixed Meta account and a Facebook Ecommerce table.
 */

export type Table = {
  id: string;
  client_id: string;
  integration_type: string;
  integration_settings: Record<string, unknown>;
  category?: string;
};
export type Row = { table_id: string; data: Record<string, unknown> };

export const DAYS = ["2026-10-30", "2026-11-02", "2026-11-05"];

/** A report table with its campaigns' campaign-level rows on three days. */
export function reportTable(
  table: Table,
  campaigns: Array<Record<string, unknown>>,
) {
  const rows = campaigns.flatMap((campaign) =>
    DAYS.map((date) => ({
      table_id: table.id,
      data: { date, entity_level: "campaign", ...campaign },
    })),
  );
  return { table, rows };
}

export const MIXED = reportTable(
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
export const ECOMMERCE = reportTable(
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
