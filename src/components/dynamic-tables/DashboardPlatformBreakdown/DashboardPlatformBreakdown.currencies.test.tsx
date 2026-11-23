import { describe, expect, it } from "vitest";
import { formatCurrency, formatUnitCost } from "@/lib/currency";
import { mixedCurrencies } from "@/lib/dashboardCurrencies.test-fixture";
import {
  cellsOf,
  fbCampaign,
  googleCampaign,
  renderBreakdown,
} from "./DashboardPlatformBreakdown.test-fixture";

describe("Meta in shekels and Google Ads in dollars", () => {
  const platforms = {
    facebook: {
      ecommerce: [],
      leads: [fbCampaign("FB leads", { spend: 22142, leads: 100 })],
      traffic: [],
    },
    google: [
      googleCampaign("Search", "leads", { spend: 300, conversions: 10 }),
    ],
  };

  it("writes each platform's row in its own currency", () => {
    renderBreakdown(platforms, null, mixedCurrencies());

    expect(cellsOf("Facebook - קמפייני לידים")[0]).toBe(
      formatCurrency(22142, "ILS"),
    );
    expect(cellsOf("Google Ads - קמפייני לידים")[0]).toBe(
      formatCurrency(300, "USD"),
    );
  });

  it("shows the total per currency instead of adding them", () => {
    renderBreakdown(platforms, null, mixedCurrencies());

    const total = cellsOf('סה"כ');
    expect(total[0]).toBe(
      `${formatCurrency(22142, "ILS")} · ${formatCurrency(300, "USD")}`,
    );
    expect(total[3]).toBe(
      `${formatUnitCost(22142 / 50, "ILS")} · ${formatUnitCost(300 / 25, "USD")}`,
    );
    expect(total[5]).toBe(
      `${formatCurrency(221.42, "ILS")} · ${formatCurrency(30, "USD")}`,
    );
  });
});
