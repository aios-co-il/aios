import { describe, expect, it } from "vitest";
import { buildReportPeriod } from "./buildReportPeriod";

const META = { id: "meta", integration_type: "facebook_insights" };
const GA = { id: "ga", integration_type: "google_analytics" };

/** A campaign-level Meta row. */
function metaRow(data: Record<string, unknown>) {
  return { table_id: "meta", data: { entity_level: "campaign", ...data } };
}

const SALES = {
  campaign_id: "s1",
  campaign_name: "מכירות",
  campaign_objective: "OUTCOME_SALES",
  optimization_goal: "OFFSITE_CONVERSIONS",
};
const LEADS = {
  campaign_id: "l1",
  campaign_name: "לידים",
  campaign_objective: "OUTCOME_LEADS",
  optimization_goal: "LEAD_GENERATION",
};

const records = [
  metaRow({
    ...SALES,
    date: "2026-11-01",
    spend: 100,
    clicks: 10,
    purchases: 2,
    purchase_value: 500,
    effective_status: "PAUSED",
  }),
  metaRow({
    ...SALES,
    date: "2026-11-02",
    spend: 50,
    clicks: 5,
    purchases: 1,
    purchase_value: 100,
    effective_status: "ACTIVE",
  }),
  metaRow({
    ...LEADS,
    date: "2026-11-01",
    spend: 200,
    clicks: 40,
    leads: 8,
    effective_status: "ACTIVE",
  }),
  {
    table_id: "meta",
    data: { ...LEADS, entity_level: "adset", date: "2026-11-01", spend: 999 },
  },
  {
    table_id: "ga",
    data: {
      report_type: "daily",
      date: "2026-11-01",
      sessions: 300,
      purchases: 4,
      purchase_value: 900,
      add_to_cart: 20,
    },
  },
  { table_id: "ga", data: { report_type: "traffic_source", sessions: 5000 } },
];

describe("buildReportPeriod", () => {
  const period = buildReportPeriod({ records, tables: [META, GA], woo: null });

  it("splits campaign-level rows by the report's goal classifier", () => {
    expect(period.goals).toEqual(["ecommerce", "leads"]);
    expect(period.scopes.all?.figures.spend).toBe(350);
    expect(period.scopes.ecommerce?.figures).toMatchObject({
      spend: 150,
      purchases: 3,
      revenue: 600,
      leads: 0,
    });
    expect(period.scopes.leads?.figures).toMatchObject({
      spend: 200,
      leads: 8,
      revenue: 0,
    });
  });

  it("sets Analytics as the store against non-lead spend, for sales only", () => {
    expect(period.scopes.ecommerce?.figures.store).toEqual({
      source: "Analytics",
      purchases: 4,
      revenue: 900,
      addToCart: 20,
      spend: 150,
    });
    expect(period.scopes.leads?.figures.store).toBeNull();
    expect(period.scopes.leads?.figures.analytics).toBeNull();
    expect(period.scopes.all?.figures.analytics?.sessions).toBe(300);
  });

  it("keeps each campaign's latest status and its days", () => {
    const [sales] = period.scopes.ecommerce?.campaigns ?? [];
    expect(sales).toMatchObject({
      name: "מכירות",
      channel: "facebook",
      on: true,
    });
    expect(period.scopes.ecommerce?.daily.map((day) => day.date)).toEqual([
      "2026-11-01",
      "2026-11-02",
    ]);
  });

  it("adds a sales scope for a store without sales campaigns", () => {
    const traffic = buildReportPeriod({
      records: [
        metaRow({
          campaign_id: "t1",
          campaign_objective: "OUTCOME_TRAFFIC",
          optimization_goal: "LINK_CLICKS",
          date: "2026-11-01",
          spend: 80,
          clicks: 90,
        }),
      ],
      tables: [META],
      woo: { revenue: 1200, orders: 3 },
    });
    expect(traffic.goals).toEqual(["ecommerce", "traffic"]);
    expect(traffic.scopes.ecommerce?.figures.store).toMatchObject({
      source: "WooCommerce",
      revenue: 1200,
      spend: 80,
    });
  });
});
