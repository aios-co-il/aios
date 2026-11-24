import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import type { GoogleAdsCampaignSummaryRow } from "../GoogleAdsCampaignSection/types";
import { DashboardContinentsView } from "./DashboardContinentsView";

const meta: FacebookCampaignRow = {
  name: "טיול לוייטנאם | לידים",
  impressions: 1000,
  clicks: 40,
  spend: 22142,
  leads: 100,
  purchases: 0,
  purchase_value: 0,
  add_to_cart: 0,
};

const google: GoogleAdsCampaignSummaryRow = {
  name: "טיול לפרו - מקס",
  campaign_id: "g1",
  goal: "leads",
  off: false,
  impressions: 500,
  clicks: 25,
  spend: 300,
  conversions: 10,
  conversions_value: 0,
};

const facebookProps = {
  campaigns: { ecommerce: [], leads: [meta], traffic: [], all: [meta] },
  records: [],
  tables: [],
  formatCurrency: (value: number) => `₪${Math.round(value)}`,
  formatNumber: (value: number) => String(Math.round(value)),
  formatUnitCost: (value: number) => `₪${value.toFixed(2)}`,
};

const googleProps = {
  campaigns: [google],
  formatCurrency: (value: number) => `$${Math.round(value)}`,
  formatNumber: (value: number) => String(Math.round(value)),
  formatUnitCost: (value: number) => `$${value.toFixed(2)}`,
};

/** The tab labels shown above the view. */
function tabLabels() {
  return screen.queryAllByRole("tab").map((tab) => tab.textContent);
}

describe("DashboardContinentsView", () => {
  it("opens the combined view with each platform's spend in its currency", () => {
    render(
      <DashboardContinentsView
        platforms={{ facebook: true, google: true }}
        facebook={facebookProps}
        google={googleProps}
      />,
    );

    expect(tabLabels()).toStrictEqual(["משולב", "Facebook", "Google Ads"]);
    expect(screen.getAllByText("₪22142").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$300").length).toBeGreaterThan(0);
    expect(screen.getByText("אסיה - Facebook לידים")).toBeTruthy();
    expect(screen.getByText("אמריקה - Google Ads")).toBeTruthy();
  });

  it("switches to Meta's continents alone", async () => {
    const user = userEvent.setup();
    render(
      <DashboardContinentsView
        platforms={{ facebook: true, google: true }}
        facebook={facebookProps}
        google={googleProps}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Facebook" }));

    expect(screen.getByText("אסיה - Facebook לידים")).toBeTruthy();
    expect(screen.queryByText("$300")).toBeNull();
  });

  it("shows only Meta's continents, without tabs, when Google names none", () => {
    render(
      <DashboardContinentsView
        platforms={{ facebook: true, google: false }}
        facebook={facebookProps}
        google={googleProps}
      />,
    );

    expect(tabLabels()).toStrictEqual([]);
    expect(screen.getByText("אסיה - Facebook לידים")).toBeTruthy();
    expect(screen.queryByText("$300")).toBeNull();
  });
});
