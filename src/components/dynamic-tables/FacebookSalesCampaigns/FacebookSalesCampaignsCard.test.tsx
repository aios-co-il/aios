import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import { FacebookSalesCampaignsCard } from "./FacebookSalesCampaignsCard";

const campaign = (
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

const formatCurrency = (value: number) => `₪${Math.round(value)}`;
const formatNumber = (value: number) => String(Math.round(value));

function renderCard(campaigns: FacebookCampaignRow[]) {
  render(
    <FacebookSalesCampaignsCard
      campaigns={campaigns}
      formatCurrency={formatCurrency}
      formatNumber={formatNumber}
    />,
  );
}

const headers = () =>
  screen.getAllByRole("columnheader").map((cell) => cell.textContent);
const cellsOf = (name: string) =>
  [...(screen.getByText(name).closest("tr")?.querySelectorAll("td") ?? [])]
    .slice(1)
    .map((cell) => cell.textContent);

describe("FacebookSalesCampaignsCard", () => {
  it("measures purchases that carry no value by cost per purchase, like leads", () => {
    renderCard([campaign("Gift course", { spend: 336, purchases: 15 })]);
    expect(headers()).not.toContain("ערך רכישות");
    expect(headers()).not.toContain("ROAS");
    expect(headers()).toContain("עלות לרכישה");
    expect(cellsOf("Gift course")).toStrictEqual([
      "1000",
      "50",
      "₪336",
      "0",
      "15",
      "₪22",
    ]);
  });

  it("keeps purchase value and ROAS for campaigns that sell with value", () => {
    renderCard([
      campaign("Shop", { spend: 100, purchases: 4, purchase_value: 500 }),
      campaign("Gift course", { spend: 336, purchases: 15 }),
      campaign("Unsold", { spend: 200 }),
    ]);
    expect(headers()).toContain("ROAS");
    expect(cellsOf("Shop").slice(-2)).toStrictEqual(["₪500", "5.00x"]);
    // Purchases without value get a dash, not a ROAS of 0.
    expect(cellsOf("Gift course").slice(-1)).toStrictEqual(["-"]);
    // Spending and selling nothing is a real 0.
    expect(cellsOf("Unsold").slice(-1)).toStrictEqual(["0x"]);
  });
});
