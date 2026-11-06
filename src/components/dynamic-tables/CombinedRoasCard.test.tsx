import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DashboardCombinedSales } from "@/lib/dashboardCombinedFigures";
import { CombinedRoasCard } from "./CombinedRoasCard";

/** Combined sales with these fields changed. */
const sales = (
  fields: Partial<DashboardCombinedSales>,
): DashboardCombinedSales => ({
  purchases: 10,
  revenue: 3500,
  addToCart: 0,
  roas: 3.5,
  costPerPurchase: 100,
  ...fields,
});

const formatCurrency = (value: number) => `₪${value.toFixed(1)}`;

describe("CombinedRoasCard", () => {
  it("shows the ROAS to two decimals", () => {
    render(
      <CombinedRoasCard sales={sales({})} formatCurrency={formatCurrency} />,
    );
    expect(screen.getByText("3.50")).toBeTruthy();
  });

  it("shows a dash, not 0.00, when no spend can be set against the revenue", () => {
    render(
      <CombinedRoasCard
        sales={sales({
          purchases: 0,
          revenue: 0,
          roas: null,
          costPerPurchase: null,
        })}
        formatCurrency={formatCurrency}
      />,
    );
    expect(screen.getByText("-")).toBeTruthy();
    expect(screen.queryByText("0.00")).toBeNull();
  });

  it("shows the cost per purchase when the purchases carry no value", () => {
    render(
      <CombinedRoasCard
        sales={sales({
          purchases: 15,
          revenue: 0,
          roas: null,
          costPerPurchase: 22.4,
        })}
        formatCurrency={formatCurrency}
      />,
    );
    expect(screen.getByText("עלות לרכישה")).toBeTruthy();
    expect(screen.getByText("₪22.4")).toBeTruthy();
    expect(screen.queryByText("ROAS משולב")).toBeNull();
  });

  it("keeps a red 0.00 for sales campaigns that spent and sold nothing", () => {
    render(
      <CombinedRoasCard
        sales={sales({
          purchases: 0,
          revenue: 0,
          roas: 0,
          costPerPurchase: null,
        })}
        formatCurrency={formatCurrency}
      />,
    );
    expect(screen.getByText("0.00")).toBeTruthy();
  });
});
