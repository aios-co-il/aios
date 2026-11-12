/** A public-dashboard table as the answer sends it. */
export type FixtureTable = {
  id: string;
  name: string;
  integration_type: string;
  integration_settings: Record<string, unknown>;
  category: string | null;
};

/** A public-dashboard record as the answer sends it. */
export type FixtureRecord = {
  id: string;
  data: Record<string, unknown>;
  created_at: string;
  _source: string;
  _tableId: string;
  _tableName: string;
  _integrationSettings?: Record<string, unknown> | null;
};

export type FixtureAnswer = {
  tables: Array<FixtureTable>;
  records: Array<FixtureRecord>;
};

export const TABLES: Array<FixtureTable> = [
  table("fb", "facebook_insights", { campaign_goal_overrides: {} }),
  table("gads", "google_ads", { conversion_goal: "leads" }),
  table("ga", "google_analytics", {}),
  table("tt", "tiktok", {}),
];

/** A table of the answer with these public settings. */
function table(
  id: string,
  type: string,
  settings: Record<string, unknown>,
): FixtureTable {
  return {
    id,
    name: `${type} report`,
    integration_type: type,
    integration_settings: settings,
    category: null,
  };
}

const DAYS = ["2026-09-01", "2026-09-02", "2026-09-08"];

/** Delivery and results, at `share` of a campaign row's. */
function metrics(spend: number, share: number): Record<string, number> {
  return {
    spend: spend * share,
    impressions: 900 * share,
    clicks: 40 * share,
    leads: 6 * share,
    purchases: 2 * share,
    purchase_value: 300 * share,
  };
}

/** Meta rows: two campaigns a day at each level, odd level spellings included. */
function metaRows(): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const [day, date] of DAYS.entries()) {
    for (const [index, campaign] of ["Leads IL", "Shop Sale"].entries()) {
      const base = {
        date,
        campaign_id: `c${index}`,
        campaign_name: campaign,
        objective: index === 0 ? "OUTCOME_LEADS" : "OUTCOME_SALES",
      };
      const spend = 100 + day * 10 + index;
      const ad = day === 0 ? "AD" : "ad";
      rows.push({ ...base, entity_level: "campaign", ...metrics(spend, 1) });
      rows.push({ ...base, entity_level: "adset", ...metrics(spend, 0.5) });
      rows.push({ ...base, entity_level: ad, ...metrics(spend, 0.25) });
    }
  }
  // Rows the dashboards count as campaign rows though they name no plain level.
  const legacy = { campaign_id: "c2", campaign_name: "Legacy" };
  rows.push({ ...legacy, date: DAYS[0], ...metrics(7, 1) });
  rows.push({ ...legacy, date: DAYS[1], entity_level: "Campaign", spend: 5 });
  return rows;
}

/** Google rows at every level, which the link still sends whole. */
function googleRows(): Array<Record<string, unknown>> {
  return DAYS.flatMap((date) =>
    ["campaign", "adset", "ad"].map((level) => ({
      date,
      entity_level: level,
      campaign_id: "g1",
      campaign_name: "Paris Search",
      cost: level === "campaign" ? 80 : 40,
      impressions: 500,
      clicks: 25,
      conversions: 4,
    })),
  );
}

/** Analytics daily rows and an undated channel roll-up. */
function analyticsRows(): Array<Record<string, unknown>> {
  return [
    ...DAYS.map((date) => ({
      date,
      report_type: "daily",
      sessions: 300,
      users: 250,
      purchases: 3,
      purchase_value: 450,
    })),
    {
      report_type: "channel_group",
      channel_group: "Paid Social",
      sessions: 120,
    },
  ];
}

/** TikTok rows at two levels, which the link still sends whole. */
function tiktokRows(): Array<Record<string, unknown>> {
  return ["campaign", "ad"].map((level) => ({
    date: DAYS[0],
    entity_level: level,
    campaign_name: "TT",
    ...metrics(30, 1),
  }));
}

const ROWS_OF: Record<string, () => Array<Record<string, unknown>>> = {
  fb: metaRows,
  gads: googleRows,
  ga: analyticsRows,
  tt: tiktokRows,
};

/** The answer public-dashboard sent before: every row, settings on each. */
export function fullAnswer(): FixtureAnswer {
  const records = TABLES.flatMap((t) =>
    ROWS_OF[t.id]().map((data, index) => ({
      id: `${t.id}-${index}`,
      data,
      created_at: "2026-09-10T00:00:00Z",
      _source: t.integration_type,
      _tableId: t.id,
      _tableName: t.name,
      _integrationSettings: t.integration_settings,
    })),
  );
  return { tables: TABLES, records };
}
