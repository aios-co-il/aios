import { describe, expect, it } from "vitest";
import { sharedIntegrationReport } from "@/components/SharedTable/sharedIntegrationReport";
import {
  combinedDashboardLeads,
  combinedDashboardSales,
  dashboardCampaignMode,
} from "./dashboardCombinedFigures";
import {
  dashboardGoalsOf,
  leadCampaigns,
  mixedCampaigns,
} from "./dashboardGoalFixtures";

const noStore = { mode: "leads" as const, storeSells: false };

describe("combinedDashboardSales and combinedDashboardLeads", () => {
  it("a lead dashboard's cost per lead is its lead spend over its leads", () => {
    const summary = dashboardGoalsOf(leadCampaigns);
    expect(combinedDashboardLeads(summary)).toStrictEqual({
      leads: 20,
      cpl: 20,
    });
    expect(combinedDashboardSales(summary, null).roas).toBe(0);
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
    const sales = combinedDashboardSales(summary, {
      purchases: 0,
      revenue: 2250,
      addToCart: 7,
    });
    // ₪1,050 spend less ₪600 on lead campaigns; no store orders, so the
    // campaigns' purchases.
    expect(sales).toStrictEqual({
      purchases: 10,
      revenue: 2250,
      addToCart: 7,
      roas: 5,
    });
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
  it("lead campaigns give lead KPIs even when a table says sales", () => {
    const summary = dashboardGoalsOf(leadCampaigns);
    expect(
      dashboardCampaignMode(summary, { ...noStore, mode: "ecommerce" }),
    ).toBe("leads");
  });

  it("a sales campaign or a selling store gives sales KPIs", () => {
    expect(
      dashboardCampaignMode(dashboardGoalsOf(mixedCampaigns), noStore),
    ).toBe("ecommerce");
    expect(
      dashboardCampaignMode(dashboardGoalsOf(leadCampaigns), {
        ...noStore,
        storeSells: true,
      }),
    ).toBe("ecommerce");
  });

  it("without campaigns in the range the tables' mode stays", () => {
    expect(
      dashboardCampaignMode(dashboardGoalsOf([]), {
        ...noStore,
        mode: "ecommerce",
      }),
    ).toBe("ecommerce");
  });
});
