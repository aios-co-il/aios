import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GoogleAdsCampaignSummaryRow } from "../GoogleAdsCampaignSection/types";
import { CampaignContinentsTab } from "./CampaignContinentsTab";

const format = {
  formatCurrency: (value: number) => `₪${Math.round(value)}`,
  formatNumber: (value: number) => String(Math.round(value)),
  formatUnitCost: (value: number) => `₪${value.toFixed(2)}`,
};

const row = (
  name: string,
  spend: number,
  conversions: number,
): GoogleAdsCampaignSummaryRow => ({
  name,
  campaign_id: name,
  goal: "leads",
  off: false,
  impressions: 1000,
  clicks: 50,
  spend,
  conversions,
  conversions_value: 0,
});

describe("CampaignContinentsTab", () => {
  it("sums each continent, then lists its campaigns in a table of its own", () => {
    render(
      <CampaignContinentsTab
        campaigns={[
          row("טיול לפטגוניה - Pmax", 534, 0),
          row("טיול לארגנטינה, צ'ילה וברזיל - Pmax", 438, 2),
          row("טיול ליפן בפריחת הדובדבן - Pmax", 315, 1),
          row("טיולי חורף - Pmax", 649, 1),
        ]}
        {...format}
      />,
    );
    expect(screen.getByText("סיכום לפי יבשת")).toBeTruthy();
    const southAmerica = screen.getAllByText("דרום אמריקה");
    expect(southAmerica).toHaveLength(2);
    expect(southAmerica[0].closest("a")?.getAttribute("href")).toBe(
      "#continent-south_america",
    );
    expect(screen.getAllByText("₪972").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₪486").length).toBeGreaterThan(0);
    expect(screen.getAllByText("אסיה")).toHaveLength(2);
    expect(screen.getAllByText("כללי")).toHaveLength(2);
  });

  it("says so when the period has no Google Ads campaigns", () => {
    render(<CampaignContinentsTab campaigns={[]} {...format} />);
    expect(
      screen.getByText("אין נתוני Google Ads בטווח התאריכים הנבחר"),
    ).toBeTruthy();
  });
});
