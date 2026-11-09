import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import {
  combinedDashboardLeads,
  combinedDashboardSales,
} from "@/lib/dashboardCombinedFigures";
import { summarizeDashboardGoals } from "@/lib/dashboardGoalSummary";
import { DashboardGoalOverview } from "./DashboardGoalOverview";

const format = {
  formatCurrency: (value: number) => `₪${Math.round(value)}`,
  formatNumber: (value: number) => String(Math.round(value)),
  formatUnitCost: (value: number) => `₪${value.toFixed(2)}`,
};

const fbCampaign = (
  name: string,
  data: Partial<FacebookCampaignRow>,
): FacebookCampaignRow => ({
  name,
  impressions: 1000,
  clicks: 100,
  spend: 0,
  leads: 0,
  purchases: 0,
  purchase_value: 0,
  add_to_cart: 0,
  ...data,
});

/** איימי בכור's week: a free course, lead campaigns on two platforms, traffic. */
function renderAimee() {
  const summary = summarizeDashboardGoals({
    facebook: {
      ecommerce: [fbCampaign("Gift course", { spend: 336, purchases: 15 })],
      leads: [fbCampaign("FB leads", { spend: 668, leads: 6 })],
      traffic: [fbCampaign("FB traffic", { spend: 674, clicks: 809 })],
    },
    google: [
      {
        name: "Search leads",
        campaign_id: "Search leads",
        goal: "leads",
        off: false,
        impressions: 45700,
        clicks: 515,
        spend: 1092,
        conversions: 1,
        conversions_value: 0,
      },
    ],
  });
  render(
    <DashboardGoalOverview
      summary={summary}
      sales={combinedDashboardSales(summary, null)}
      leads={combinedDashboardLeads(summary)}
      delivery={{ spend: 2770, impressions: 78500, clicks: 1700 }}
      platformLabel={(platform) => ({
        name: platform === "google_ads" ? "Google Ads" : "Facebook",
        color: "",
        icon: null,
      })}
      format={format}
    />,
  );
}

describe("DashboardGoalOverview", () => {
  it("shows what every goal shares once, then each goal apart", () => {
    renderAimee();
    expect(screen.getByText("₪2770")).toBeTruthy();
    expect(screen.getByText("קמפייני מכירות")).toBeTruthy();
    expect(screen.getByText("קמפייני לידים")).toBeTruthy();
    expect(screen.getByText("קמפייני תנועה")).toBeTruthy();
  });

  it("measures the free course by cost per purchase, never a ROAS", () => {
    renderAimee();
    // Both the top card and the sales panel show it in place of a ROAS.
    expect(screen.getAllByText("עלות לרכישה")).toHaveLength(2);
    expect(screen.getAllByText("₪22")).toHaveLength(2);
    expect(screen.queryByText("ROAS")).toBeNull();
    expect(screen.queryByText("ROAS משולב")).toBeNull();
  });

  it("keeps each platform's cost per lead next to the combined one", () => {
    renderAimee();
    expect(screen.getByText("₪251")).toBeTruthy();
    expect(
      screen.getByText("לפי פלטפורמה: Facebook ₪111 · Google Ads ₪1092"),
    ).toBeTruthy();
  });

  it("gives traffic its clicks and cost per click", () => {
    renderAimee();
    expect(screen.getByText("809")).toBeTruthy();
    expect(screen.getByText("₪0.83")).toBeTruthy();
  });

  it("keeps the sales ROAS on top, over the sales spend only", () => {
    const summary = summarizeDashboardGoals({
      facebook: {
        ecommerce: [
          fbCampaign("Shop", {
            spend: 1000,
            purchases: 10,
            purchase_value: 4000,
          }),
        ],
        leads: [fbCampaign("Leads", { spend: 1000, leads: 20 })],
        traffic: [],
      },
      google: [],
    });
    render(
      <DashboardGoalOverview
        summary={summary}
        sales={combinedDashboardSales(summary, null)}
        leads={combinedDashboardLeads(summary)}
        delivery={{ spend: 2000, impressions: 2000, clicks: 200 }}
        platformLabel={() => ({ name: "Facebook", color: "", icon: null })}
        format={format}
      />,
    );
    expect(screen.getByText("ROAS משולב")).toBeTruthy();
    // 4000 over the sales spend of 1000, not over the 2000 of all goals.
    expect(screen.getAllByText("4.00").length).toBeGreaterThan(0);
  });
});
