import { describe, expect, it } from "vitest";
import type { GoogleAdsRowData } from "@/lib/googleCampaignGoals";
import { summarizeGoogleAdsCampaigns } from "./summarizeGoogleAdsCampaigns";

const table = {
  id: "g",
  integration_type: "google_ads",
  integration_settings: { campaign_type: "ecommerce" },
};
const row = (data: GoogleAdsRowData) => ({
  _tableId: "g",
  data: { date: "2026-10-20", entity_level: "campaign", ...data },
});

describe("summarizeGoogleAdsCampaigns", () => {
  it("keeps each campaign's own goal and totals per goal", () => {
    const summary = summarizeGoogleAdsCampaigns(
      [
        row({
          campaign_id: "shop",
          campaign_name: "PMax חנות",
          conversion_goal: "ecommerce",
          cost: 100,
          conversions: 2,
          conversions_value: 500,
        }),
        row({
          campaign_id: "lead",
          campaign_name: "PMax לידים",
          conversion_goal: "leads",
          cost: 60,
          conversions: 3,
          conversions_value: 3,
        }),
      ],
      [table],
    );
    expect(summary.hasEcommerce).toBe(true);
    expect(summary.hasLeads).toBe(true);
    expect(summary.campaigns.map((c) => [c.campaign_id, c.goal])).toEqual([
      ["shop", "ecommerce"],
      ["lead", "leads"],
    ]);
    expect(summary.ecommerce.conversions_value).toBe(500);
    expect(summary.leads.conversions).toBe(3);
  });

  it("falls back to the report type when a campaign has no goal yet", () => {
    const summary = summarizeGoogleAdsCampaigns(
      [row({ campaign_id: "old", campaign_name: "PMax", cost: 10 })],
      [table],
    );
    expect(summary.campaigns[0].goal).toBe("ecommerce");
    expect(summary.hasLeads).toBe(false);
  });
});
