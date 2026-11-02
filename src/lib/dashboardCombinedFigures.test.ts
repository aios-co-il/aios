import { describe, expect, it } from "vitest";
import { sharedIntegrationReport } from "@/components/SharedTable/sharedIntegrationReport";
import {
  combinedDashboardLeads,
  combinedDashboardSales,
  dashboardCampaignMode,
  dashboardStore,
} from "./dashboardCombinedFigures";
import {
  dashboardGoalsOf,
  leadCampaigns,
  mixedCampaigns,
} from "./dashboardGoalFixtures";

const noWoo = { revenue: 0, orders: 0 };

const analytics = (data: Record<string, unknown>) => ({
  _source: "google_analytics",
  data: { date: "2026-10-20", report_type: "daily", sessions: 50, ...data },
});

const wooStore = {
  source: "WooCommerce" as const,
  purchases: 0,
  revenue: 2250,
  addToCart: 7,
};

describe("dashboardStore", () => {
  it("is WooCommerce when it sold in the range, with Analytics' add-to-cart", () => {
    expect(
      dashboardStore([analytics({ add_to_cart: 7 })], {
        revenue: 900,
        orders: 3,
      }),
    ).toStrictEqual({
      source: "WooCommerce",
      purchases: 3,
      revenue: 900,
      addToCart: 7,
    });
  });

  it("is Analytics when its daily rows have revenue or purchases", () => {
    expect(
      dashboardStore(
        [analytics({ purchases: 2, purchase_value: 400, add_to_cart: 5 })],
        noWoo,
      ),
    ).toStrictEqual({
      source: "Analytics",
      purchases: 2,
      revenue: 400,
      addToCart: 5,
    });
  });

  it("is none for undated Analytics rows, ₪0 revenue or add-to-cart alone", () => {
    const trafficSource = {
      _source: "google_analytics",
      data: { report_type: "traffic_source", purchase_value: 800 },
    };
    expect(dashboardStore([trafficSource], noWoo)).toBeNull();
    expect(
      dashboardStore([analytics({ purchase_value: 0 })], noWoo),
    ).toBeNull();
    expect(dashboardStore([analytics({ add_to_cart: 9 })], noWoo)).toBeNull();
  });
});

describe("combinedDashboardSales and combinedDashboardLeads", () => {
  it("a lead dashboard's cost per lead is its lead spend over its leads", () => {
    const summary = dashboardGoalsOf(leadCampaigns);
    expect(combinedDashboardLeads(summary)).toStrictEqual({
      leads: 20,
      cpl: 20,
    });
    expect(combinedDashboardSales(summary, null).roas).toBeNull();
  });

  it("a mixed dashboard takes ROAS and CPL from each goal's sums", () => {
    const summary = dashboardGoalsOf(mixedCampaigns);
    // 1400 / 400: not the rows' average of 5x and 3x, nor over all 1050.
    expect(combinedDashboardSales(summary, null)).toStrictEqual({
      purchases: 10,
      revenue: 1400,
      addToCart: 9,
      roas: 3.5,
    });
    // 600 / 5: not the rows' average of ₪50 and ₪400, nor over all 1050.
    expect(combinedDashboardLeads(summary).cpl).toBe(120);
  });

  it("the store's revenue is set against all spend but the lead campaigns'", () => {
    const summary = dashboardGoalsOf(mixedCampaigns);
    // ₪1,050 spend less ₪600 on lead campaigns; no store orders, so the
    // campaigns' purchases.
    expect(combinedDashboardSales(summary, wooStore)).toStrictEqual({
      purchases: 10,
      revenue: 2250,
      addToCart: 7,
      roas: 5,
    });
  });

  it("a store with only lead campaigns running has no ROAS", () => {
    const summary = dashboardGoalsOf(leadCampaigns);
    expect(combinedDashboardSales(summary, wooStore).roas).toBeNull();
  });

  it("a table's own KPIs and its dashboard rows agree", () => {
    const facebookRecords = mixedCampaigns.filter(
      (record) => record._source === "facebook_insights",
    );
    const table = sharedIntegrationReport(facebookRecords, {
      integrationType: "facebook_insights",
      level: "campaign",
      integrationSettings: {},
      tableGoals: { goalOf: null, hasEcommerce: false, hasLeads: true },
      tableMode: "leads",
    }).summary;
    const summary = dashboardGoalsOf(facebookRecords);
    expect(combinedDashboardSales(summary, null).roas).toBe(table?.roas);
    expect(combinedDashboardLeads(summary)).toStrictEqual({
      leads: table?.leads,
      cpl: table?.cpl,
    });
  });
});

describe("dashboardCampaignMode", () => {
  const salesTable = [
    {
      integration_type: "google_ads",
      integration_settings: { campaign_type: "ecommerce" },
    },
  ];

  it("lead campaigns give lead KPIs even when a table says sales", () => {
    const summary = dashboardGoalsOf(leadCampaigns);
    expect(dashboardCampaignMode(summary, null, salesTable)).toBe("leads");
  });

  it("a sales campaign or a store that sold gives sales KPIs", () => {
    const mixed = dashboardGoalsOf(mixedCampaigns);
    const leads = dashboardGoalsOf(leadCampaigns);
    expect(dashboardCampaignMode(mixed, null, [])).toBe("ecommerce");
    expect(dashboardCampaignMode(leads, wooStore, [])).toBe("ecommerce");
  });

  it("without campaigns in the range a sales table decides", () => {
    const empty = dashboardGoalsOf([]);
    expect(dashboardCampaignMode(empty, null, salesTable)).toBe("ecommerce");
    expect(dashboardCampaignMode(empty, null, [])).toBe("leads");
  });
});
