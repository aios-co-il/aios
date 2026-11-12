import { describe, expect, it } from "vitest";
import { googleCampaignGoalOf } from "@/lib/googleCampaignGoals";
import { sharedIntegrationReport } from "./sharedIntegrationReport";
import type { SharedTableGoals } from "./useSharedTableGoals";

/** What useSharedTableGoals gives a table that is not Google Ads. */
const singleGoal: SharedTableGoals = {
  goalOf: null,
  hasEcommerce: false,
  hasLeads: true,
  hasTraffic: false,
};

const facebook = (name: string, data: Record<string, unknown>) => ({
  data: {
    date: "2026-10-20",
    campaign_id: name,
    campaign_name: name,
    entity_level: "campaign",
    impressions: 1000,
    clicks: 40,
    ...data,
  },
});

/** A sales, a legacy CONVERSIONS lead and a traffic campaign on one table. */
const mixedFacebook = [
  facebook("sales", {
    campaign_objective: "OUTCOME_SALES",
    spend: 100,
    purchases: 2,
    purchase_value: 300,
    leads: 1,
  }),
  facebook("lead", {
    campaign_type: "lead",
    campaign_objective: "CONVERSIONS",
    spend: 50,
    leads: 5,
  }),
  facebook("traffic", { campaign_type: "traffic", spend: 20 }),
];

describe("sharedIntegrationReport", () => {
  it("a mixed Facebook table counts each goal's KPIs apart", () => {
    const report = sharedIntegrationReport(mixedFacebook, {
      integrationType: "facebook_insights",
      level: "campaign",
      integrationSettings: {},
      tableGoals: singleGoal,
      tableMode: "leads",
    });
    expect(report.goals).toStrictEqual({
      hasEcommerce: true,
      hasLeads: true,
      hasTraffic: true,
    });
    // The table's single-goal settings would zero the purchases.
    expect(report.summary).toMatchObject({
      spend: 170,
      purchases: 2,
      revenue: 300,
      roas: 3,
      leads: 5,
      cpl: 10,
    });
  });

  it("a leads-only Facebook table counts no sales", () => {
    const report = sharedIntegrationReport(mixedFacebook, {
      integrationType: "facebook_insights",
      level: "campaign",
      integrationSettings: { campaign_type: "leads" },
      tableGoals: singleGoal,
      tableMode: "leads",
    });
    expect(report.summary).toMatchObject({ purchases: 0, revenue: 0 });
  });

  it("a Google table counts each campaign toward its goal", () => {
    const table = {
      id: "g",
      integration_type: "google_ads",
      integration_settings: { campaign_type: "leads" },
    };
    const records = [
      {
        data: {
          date: "2026-10-20",
          campaign_id: "pmax",
          campaign_name: "pmax",
          conversion_goal: "ecommerce" as const,
          cost: 200,
          conversions: 4,
          conversions_value: 800,
        },
      },
      {
        data: {
          date: "2026-10-20",
          campaign_id: "search",
          campaign_name: "search",
          conversion_goal: "leads" as const,
          cost: 100,
          conversions: 5,
        },
      },
    ];
    const tableGoals = googleCampaignGoalOf(
      records.map((record) => ({ table_id: table.id, data: record.data })),
      [table],
      "leads",
    );
    const report = sharedIntegrationReport(records, {
      integrationType: "google_ads",
      level: "campaign",
      integrationSettings: table.integration_settings,
      tableGoals,
      tableMode: "leads",
    });
    expect(report.summary).toMatchObject({ roas: 4, leads: 5, cpl: 20 });
  });

  it("an analytics table has session KPIs", () => {
    const report = sharedIntegrationReport([{ data: { sessions: 30 } }], {
      integrationType: "google_analytics",
      level: "adset",
      tableGoals: singleGoal,
      tableMode: "leads",
    });
    expect(report.summary?.sessions).toBe(30);
  });
});
