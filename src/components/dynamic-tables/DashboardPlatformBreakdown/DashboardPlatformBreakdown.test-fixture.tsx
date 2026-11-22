import { render, screen } from "@testing-library/react";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import type { DashboardCurrencies } from "@/lib/dashboardCurrencies";
import { singleCurrency } from "@/lib/dashboardCurrencies.test-fixture";
import {
  combinedDashboardLeads,
  combinedDashboardSales,
  type DashboardStore,
} from "@/lib/dashboardCombinedFigures";
import { summarizeDashboardGoals } from "@/lib/dashboardGoalSummary";
import type { GoogleAdsCampaignSummaryRow } from "../GoogleAdsCampaignSection/types";
import { DashboardPlatformBreakdown } from "./DashboardPlatformBreakdown";

/** A Facebook campaign row with these figures over zeroed defaults. */
export function fbCampaign(
  name: string,
  data: Partial<FacebookCampaignRow>,
): FacebookCampaignRow {
  return {
    name,
    impressions: 1000,
    clicks: 50,
    spend: 0,
    leads: 0,
    purchases: 0,
    purchase_value: 0,
    add_to_cart: 0,
    ...data,
  };
}

/** A Google Ads campaign of this goal with these figures. */
export function googleCampaign(
  name: string,
  goal: "ecommerce" | "leads",
  data: Partial<GoogleAdsCampaignSummaryRow>,
): GoogleAdsCampaignSummaryRow {
  return {
    name,
    campaign_id: name,
    goal,
    off: false,
    impressions: 500,
    clicks: 25,
    spend: 0,
    conversions: 0,
    conversions_value: 0,
    ...data,
  };
}

const format = {
  formatCurrency: (value: number) => `₪${Math.round(value)}`,
  formatNumber: (value: number) => String(Math.round(value)),
  formatUnitCost: (value: number) => `₪${value.toFixed(2)}`,
};

/** Renders the breakdown of these campaigns, store and currencies. */
export function renderBreakdown(
  platforms: Parameters<typeof summarizeDashboardGoals>[0],
  store: DashboardStore | null,
  currencies: DashboardCurrencies = singleCurrency(),
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
      currencies={currencies}
    />,
  );
}

/** The table's column headers. */
export function headers() {
  return screen.getAllByRole("columnheader").map((cell) => cell.textContent);
}

/** A row's cells after its label. */
export function cellsOf(rowName: string | RegExp) {
  return [
    ...(screen.getByText(rowName).closest("tr")?.querySelectorAll("td") ?? []),
  ]
    .slice(1)
    .map((cell) => cell.textContent);
}
