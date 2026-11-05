import { describe, expect, it } from "vitest";
import { buildWeeklyCampaignSections } from "./weeklyAdsComparison";
import {
  weeklySourceModesForTable,
  weeklySourceModesForTables,
} from "./weeklyCampaignGoals";

const NOW = new Date("2026-09-18T12:00:00Z");
const fb = (campaign: string, data: Record<string, unknown>) => ({
  _source: "facebook_insights",
  data: {
    date: "2026-09-14",
    campaign_id: campaign,
    campaign_name: campaign,
    entity_level: "campaign",
    impressions: 1000,
    clicks: 50,
    ...data,
  },
});
const leadCampaign = fb("Leads", {
  campaign_type: "lead",
  spend: 300,
  leads: 10,
});

describe("weeklySourceModesForTables", () => {
  const facebook = (integration_settings: Record<string, unknown> | null) => ({
    integration_type: "facebook_insights",
    integration_settings,
  });
  const googleTable = (campaign_type?: string) => ({
    integration_type: "google_ads",
    integration_settings: campaign_type ? { campaign_type } : {},
  });

  it("a dashboard with one report table reads it as that table's report does", () => {
    for (const settings of [{}, { campaign_type: "leads" }, null]) {
      expect(weeklySourceModesForTables([facebook(settings)])).toStrictEqual(
        weeklySourceModesForTable(settings),
      );
    }
    for (const campaignType of ["ecommerce", "leads", undefined]) {
      const table = googleTable(campaignType);
      expect(weeklySourceModesForTables([table]).google_ads).toBe(
        weeklySourceModesForTable(table.integration_settings).google_ads,
      );
    }
  });

  it("a mixed Facebook table splits its weekly tab even when no row sold in the range", () => {
    // Before: the dashboards set leads-only when the period's rows showed no
    // purchase, so a campaign set to add to cart showed as leads.
    const cart = fb("Cart", {
      result_kind: "add_to_cart",
      spend: 80,
      add_to_cart: 6,
    });
    const [week] = buildWeeklyCampaignSections([cart, leadCampaign], {
      now: NOW,
      sourceModes: weeklySourceModesForTables([facebook({})]),
    });
    expect(week.groups.map((group) => group.kind)).toStrictEqual([
      "ecommerce",
      "leads",
    ]);
  });

  it("Google rows no rule can key fall back to sales when a Google table sells", () => {
    expect(
      weeklySourceModesForTables([
        googleTable("leads"),
        googleTable("ecommerce"),
      ]).google_ads,
    ).toBe("ecommerce");
  });
});
