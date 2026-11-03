// Builders for Production-shaped campaign rows (report-goal-fixtures.ts).

export const DAYS = [
  "2026-10-30",
  "2026-10-31",
  "2026-11-01",
  "2026-11-02",
  "2026-11-03",
  "2026-11-04",
  "2026-11-05",
  "2026-11-06",
];

/** A client's report table. */
export function table(
  id: string,
  client_id: string,
  integration_type: string,
  integration_settings: Record<string, unknown> = {},
  category = "Facebook Insights",
) {
  return { id, client_id, integration_type, integration_settings, category };
}

/** Each Meta campaign's setup, as the sync stamps it on every row. */
export const SALES = {
  campaign_objective: "OUTCOME_SALES",
  optimization_goal: "OFFSITE_CONVERSIONS",
  campaign_type: "ecommerce",
  result_kind: "purchases",
};
export const AWARENESS = {
  campaign_objective: "OUTCOME_AWARENESS",
  optimization_goal: "REACH",
  campaign_type: "other",
};
export const LANDING_PAGE_TRAFFIC = {
  campaign_objective: "OUTCOME_TRAFFIC",
  optimization_goal: "LANDING_PAGE_VIEWS",
  campaign_type: "traffic",
  result_kind: "landing_page_views",
};
export const LINK_TRAFFIC = {
  campaign_objective: "OUTCOME_TRAFFIC",
  optimization_goal: "LINK_CLICKS",
  campaign_type: "traffic",
  result_kind: "link_clicks",
};
export const LEADS = {
  campaign_objective: "OUTCOME_LEADS",
  optimization_goal: "OFFSITE_CONVERSIONS",
  campaign_type: "lead",
  result_kind: "leads",
};

/**
 * A Meta campaign's daily rows: null spend is a day without a row. Every row
 * carries 0 leads, purchases and conversations, as the Meta sync writes them.
 */
export function meta(
  table_id: string,
  campaign_id: string,
  campaign_name: string,
  setup: Record<string, unknown>,
  spends: Array<number | null>,
  extra: (day: number) => Record<string, unknown> = () => ({}),
) {
  return rows(spends, (spend, day) => ({
    table_id,
    data: {
      campaign_id,
      campaign_name,
      ...setup,
      spend,
      leads: 0,
      form_leads: 0,
      purchases: 0,
      purchase_value: 0,
      conversations: 0,
      effective_status: "ACTIVE",
      configured_status: "ACTIVE",
      ...extra(day),
    },
  }));
}

/** A Google Ads campaign's daily rows: cost and 0 conversions, no status. */
export function google(
  table_id: string,
  campaign_id: string,
  campaign_name: string,
  costs: Array<number | null>,
) {
  return rows(costs, (cost) => ({
    table_id,
    data: {
      campaign_id,
      campaign_name,
      campaign_channel_type: "PERFORMANCE_MAX",
      cost,
      clicks: 12,
      conversions: 0,
      conversions_value: 0,
    },
  }));
}

/** One dated campaign-level row per day that has a value. */
function rows(
  values: Array<number | null>,
  row: (
    value: number,
    day: number,
  ) => { table_id: string; data: Record<string, unknown> },
) {
  return values.flatMap((value, day) => {
    if (value === null) {
      return [];
    }
    const { table_id, data } = row(value, day);
    return [
      {
        table_id,
        data: { date: DAYS[day], entity_level: "campaign", ...data },
      },
    ];
  });
}
