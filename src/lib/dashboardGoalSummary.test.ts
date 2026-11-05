import { describe, expect, it } from "vitest";
import {
  dashboardGoalsOf,
  leadCampaigns,
  mixedCampaigns,
} from "./dashboardGoalFixtures";

describe("summarizeDashboardGoals", () => {
  it("a dashboard of lead campaigns has no sales row and no revenue", () => {
    const summary = dashboardGoalsOf(leadCampaigns);
    expect(summary.hasEcommerce).toBe(false);
    expect(summary.hasLeads).toBe(true);
    expect(summary.rows.map((row) => row.key)).toStrictEqual([
      "facebook_insights:leads",
      "google_ads:leads",
    ]);
    // The pixel purchase and the Google conversion value are not sales.
    expect(summary.goals.leads).toMatchObject({
      spend: 400,
      leads: 20,
      purchases: 0,
      revenue: 0,
    });
    expect(summary.goals.ecommerce).toMatchObject({ spend: 0, revenue: 0 });
  });

  it("a mixed dashboard counts each campaign toward its own goal only", () => {
    const summary = dashboardGoalsOf(mixedCampaigns);
    expect(summary.rows.map((row) => row.key)).toStrictEqual([
      "facebook_insights:ecommerce",
      "google_ads:ecommerce",
      "facebook_insights:leads",
      "google_ads:leads",
      "facebook_insights:traffic",
    ]);
    expect(summary.total).toStrictEqual({
      spend: 1050,
      impressions: 4000,
      clicks: 160,
    });
    // A sales campaign's pixel leads and a lead campaign's conversion value
    // stay out of the other goal; traffic adds spend only.
    expect(summary.goals.ecommerce).toMatchObject({
      spend: 400,
      purchases: 10,
      revenue: 1400,
      leads: 0,
    });
    expect(summary.goals.leads).toMatchObject({
      spend: 600,
      leads: 5,
      revenue: 0,
    });
    expect(summary.goals.traffic).toMatchObject({
      spend: 50,
      purchases: 0,
      leads: 0,
    });
  });

  it("only sales campaigns that reported add-to-cart show it", () => {
    const rows = dashboardGoalsOf(mixedCampaigns).rows;
    const metricsOf = (key: string) =>
      rows.find((row) => row.key === key)?.metrics;
    expect(metricsOf("facebook_insights:ecommerce")).toMatchObject({
      addToCart: 9,
      addToCartTracked: true,
    });
    expect(metricsOf("google_ads:ecommerce")?.addToCartTracked).toBe(false);
    expect(metricsOf("facebook_insights:leads")?.addToCartTracked).toBe(false);
  });
});
