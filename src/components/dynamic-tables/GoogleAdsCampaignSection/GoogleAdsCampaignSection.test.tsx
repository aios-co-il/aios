import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GoogleAdsRowData } from "@/lib/googleCampaignGoals";
import { GoogleAdsCampaignSection } from "./GoogleAdsCampaignSection";
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

describe("GoogleAdsCampaignSection", () => {
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
    expect(screen.getByText("קמפייני מכירות - Google Ads")).toBeTruthy();
    expect(screen.getByText("קמפייני לידים - Google Ads")).toBeTruthy();
    const [salesTable, leadsTable] = screen.getAllByRole("table");
    expect(within(salesTable).getByText("PMax חנות")).toBeTruthy();
    expect(within(salesTable).queryByText("PMax לידים")).toBeNull();
    expect(within(leadsTable).getByText("PMax לידים")).toBeTruthy();
    expect(within(leadsTable).getByText("עלות להמרה")).toBeTruthy();
    // ROAS card counts only the sales campaign: 500 / 100.
    expect(screen.getAllByText("5.00").length).toBeGreaterThan(0);
  });
});
