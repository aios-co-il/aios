import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { summarizeGoogleAdsCampaigns } from "@/lib/googleAdsReport";
import { GoogleAdsCampaignSection } from "./GoogleAdsCampaignSection";

const table = {
  id: "g",
  integration_type: "google_ads",
  integration_settings: { campaign_type: "ecommerce" },
};
const row = (data: Record<string, unknown>) => ({
  _tableId: "g",
  data: { date: "2026-10-20", entity_level: "campaign", ...data },
});
const records = [
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
];
const format = (n: number) => String(Math.round(n * 100) / 100);

describe("Google Ads report by campaign goal", () => {
  it("keeps each campaign's own goal and totals per goal", () => {
    const summary = summarizeGoogleAdsCampaigns(records, [table]);
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

  it("renders a sales table and a leads table for a mixed account", () => {
    render(
      <GoogleAdsCampaignSection
        summary={summarizeGoogleAdsCampaigns(records, [table])}
        icon={null}
        formatCurrency={format}
        formatNumber={format}
        formatUnitCost={format}
      />,
    );
    const sales = screen
      .getByText("קמפייני מכירות - Google Ads")
      .closest("div.rounded-lg, [class*='card']") as HTMLElement;
    const leads = screen
      .getByText("קמפייני לידים - Google Ads")
      .closest("div.rounded-lg, [class*='card']") as HTMLElement;
    expect(within(sales).getByText("PMax חנות")).toBeTruthy();
    expect(within(sales).queryByText("PMax לידים")).toBeNull();
    expect(within(leads).getByText("PMax לידים")).toBeTruthy();
    expect(within(leads).getByText("עלות להמרה")).toBeTruthy();
    // ROAS card counts only the sales campaign: 500 / 100.
    expect(screen.getAllByText("5.00").length).toBeGreaterThan(0);
  });
});
