import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import {
  combinedDashboardLeads,
  combinedDashboardSales,
  type DashboardStore,
} from "@/lib/dashboardCombinedFigures";
import { summarizeDashboardGoals } from "@/lib/dashboardGoalSummary";
import type { GoogleAdsCampaignSummaryRow } from "../GoogleAdsCampaignSection/types";
import { DashboardPlatformBreakdown } from "./DashboardPlatformBreakdown";

const fbCampaign = (
  name: string,
  data: Partial<FacebookCampaignRow>,
): FacebookCampaignRow => ({
  name,
  impressions: 1000,
  clicks: 50,
  spend: 0,
  leads: 0,
  purchases: 0,
  purchase_value: 0,
  add_to_cart: 0,
  ...data,
});

const googleCampaign = (
  name: string,
  goal: "ecommerce" | "leads",
  data: Partial<GoogleAdsCampaignSummaryRow>,
): GoogleAdsCampaignSummaryRow => ({
  name,
  campaign_id: name,
  goal,
  impressions: 500,
  clicks: 25,
  spend: 0,
  conversions: 0,
  conversions_value: 0,
  ...data,
});

const format = {
  formatCurrency: (value: number) => `₪${Math.round(value)}`,
  formatNumber: (value: number) => String(Math.round(value)),
  formatUnitCost: (value: number) => `₪${value.toFixed(2)}`,
};

function renderBreakdown(
  platforms: Parameters<typeof summarizeDashboardGoals>[0],
  store: DashboardStore | null,
) {
  const summary = summarizeDashboardGoals(platforms);
  render(
    <DashboardPlatformBreakdown
      summary={summary}
      sales={combinedDashboardSales(summary, store)}
      leads={combinedDashboardLeads(summary)}
      revenueSource={store?.source ?? null}
      platformLabel={(platform) => ({
        name: platform === "google_ads" ? "Google Ads" : "Facebook",
        color: "",
        icon: null,
      })}
      format={format}
    />,
  );
}

const headers = () =>
  screen.getAllByRole("columnheader").map((cell) => cell.textContent);
const cellsOf = (rowName: string) =>
  [...(screen.getByText(rowName).closest("tr")?.querySelectorAll("td") ?? [])]
    .slice(1)
    .map((cell) => cell.textContent);

describe("DashboardPlatformBreakdown", () => {
  it("a dashboard of lead campaigns has no sales, revenue or ROAS columns", () => {
    renderBreakdown(
      {
        facebook: {
          ecommerce: [],
          leads: [fbCampaign("FB leads", { spend: 300, leads: 10 })],
          traffic: [],
        },
        google: [
          googleCampaign("Search", "leads", {
            spend: 100,
            conversions: 10,
            conversions_value: 50,
          }),
        ],
      },
      null,
    );
    expect(headers()).toStrictEqual([
      "פלטפורמה",
      "הוצאה",
      "חשיפות",
      "קליקים",
      "עלות לקליק",
      "לידים",
      "עלות לליד",
    ]);
    expect(screen.queryByText("ROAS")).toBeNull();
    expect(cellsOf("Google Ads - קמפייני לידים")).toStrictEqual([
      "₪100",
      "500",
      "25",
      "₪4.00",
      "10",
      "₪10",
    ]);
    expect(cellsOf('סה"כ')).toStrictEqual([
      "₪400",
      "1500",
      "75",
      "₪5.33",
      "20",
      "₪20",
    ]);
  });

  it("a mixed dashboard fills each row's own goal and totals each goal from sums", () => {
    renderBreakdown(
      {
        facebook: {
          ecommerce: [
            fbCampaign("FB sales", {
              spend: 100,
              purchases: 4,
              purchase_value: 500,
              add_to_cart: 9,
              leads: 3,
            }),
          ],
          leads: [fbCampaign("FB leads", { spend: 200, leads: 4 })],
          traffic: [fbCampaign("FB traffic", { spend: 50 })],
        },
        google: [
          googleCampaign("Shopping", "ecommerce", {
            spend: 300,
            conversions: 6,
            conversions_value: 900,
          }),
          googleCampaign("Search", "leads", { spend: 400, conversions: 1 }),
        ],
      },
      { purchases: 12, revenue: 2250, addToCart: 30, source: "WooCommerce" },
    );
    expect(headers()).toStrictEqual([
      "פלטפורמה",
      "הוצאה",
      "חשיפות",
      "קליקים",
      "עלות לקליק",
      "הוספה לעגלה",
      "רכישות",
      "הכנסות",
      "ROAS",
      "לידים",
      "עלות לליד",
    ]);
    expect(cellsOf("Facebook - קמפייני מכירות").slice(4)).toStrictEqual([
      "9",
      "4",
      "₪500",
      "5.00",
      "-",
      "-",
    ]);
    // Google Ads reports no add-to-cart, so its sales row shows a dash there.
    expect(cellsOf("Google Ads - קמפייני מכירות")[4]).toBe("-");
    expect(cellsOf("Facebook - קמפייני לידים").slice(4)).toStrictEqual([
      "-",
      "-",
      "-",
      "-",
      "4",
      "₪50",
    ]);
    expect(cellsOf("Facebook - קמפייני תנועה").slice(4)).toStrictEqual(
      Array(6).fill("-"),
    );
    // WooCommerce revenue over the ₪450 spent outside lead campaigns; the
    // lead campaigns' ₪600 over their 5 leads.
    expect(cellsOf('סה"כ').slice(4)).toStrictEqual([
      "30",
      "12",
      "₪2250",
      "5.00",
      "5",
      "₪120",
    ]);
    expect(
      screen.getByText("הכנסות WooCommerce / הוצאות פרסום ללא קמפייני לידים"),
    ).toBeTruthy();
  });

  it("a dash for ROAS and add-to-cart when nothing can be set against them", () => {
    renderBreakdown(
      {
        facebook: {
          ecommerce: [fbCampaign("FB sales", { purchases: 1 })],
          leads: [fbCampaign("FB leads", { spend: 200, leads: 4 })],
          traffic: [],
        },
        google: [],
      },
      { purchases: 2, revenue: 500, addToCart: 0, source: "WooCommerce" },
    );
    // All ₪200 went to lead campaigns, so the store's ₪500 has no spend.
    expect(cellsOf('סה"כ').slice(4)).toStrictEqual([
      "-",
      "2",
      "₪500",
      "-",
      "4",
      "₪50",
    ]);
  });
});
