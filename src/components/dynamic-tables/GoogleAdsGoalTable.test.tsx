import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoogleAdsGoalTable } from "./GoogleAdsGoalTable";

const row = (
  key: string,
  cost: number,
  conversions: number,
  conversions_value: number,
) => ({
  key,
  name: key,
  impressions: 1000,
  clicks: 40,
  conversions,
  cost,
  conversions_value,
});

const headers = (region: HTMLElement) =>
  within(region)
    .getAllByRole("columnheader")
    .map((cell) => cell.textContent);
const footer = (region: HTMLElement) =>
  [...region.querySelectorAll("tfoot td")].map((cell) => cell.textContent);

describe("Google Ads report table per goal", () => {
  it("a lead table has cost per lead and no value or ROAS", () => {
    render(
      <GoogleAdsGoalTable
        goal="leads"
        rows={[row("Search", 300, 6, 6), row("PMax", 100, 4, 4)]}
        entityColumnLabel="קמפיין"
        currency="₪"
      />,
    );
    const region = screen.getByRole("region", { name: "קמפייני לידים" });
    expect(headers(region)).toStrictEqual([
      "קמפיין",
      "חשיפות",
      "קליקים",
      "לידים",
      "עלות",
      "עלות לליד",
    ]);
    expect(footer(region)).toStrictEqual([
      "סה״כ",
      "2,000",
      "80",
      "10",
      "₪400",
      "₪40",
    ]);
    expect(screen.queryByText("ROAS")).toBeNull();
    expect(screen.queryByText(/^[\d.]+x$/)).toBeNull();
  });

  it("a sales table has value and ROAS, totals of its own campaigns", () => {
    render(
      <GoogleAdsGoalTable
        goal="ecommerce"
        rows={[row("Shop", 200, 4, 1000)]}
        entityColumnLabel="קמפיין"
        currency="₪"
        showTitle
      />,
    );
    const region = screen.getByRole("region", { name: "קמפייני מכירות" });
    expect(
      within(region).getByRole("heading", { name: "קמפייני מכירות" }),
    ).toBeTruthy();
    expect(headers(region)).toStrictEqual([
      "קמפיין",
      "חשיפות",
      "קליקים",
      "המרות",
      "עלות",
      "ערך המרות",
      "ROAS",
    ]);
    expect(footer(region)).toStrictEqual([
      "סה״כ מכירות",
      "1,000",
      "40",
      "4",
      "₪200",
      "₪1,000",
      "5x",
    ]);
  });

  it("WooCommerce replaces the sales totals only", () => {
    const woo = { conversions: 7, revenue: 1400 };
    const { unmount } = render(
      <GoogleAdsGoalTable
        goal="ecommerce"
        rows={[row("Shop", 200, 4, 1000)]}
        entityColumnLabel="קמפיין"
        currency="₪"
        wooTotals={woo}
      />,
    );
    const sales = screen.getByRole("region", { name: "קמפייני מכירות" });
    expect(headers(sales)).toContain("המרות (GA)");
    expect(footer(sales).slice(3)).toStrictEqual(["7", "₪200", "₪1,400", "7x"]);
    unmount();

    render(
      <GoogleAdsGoalTable
        goal="leads"
        rows={[row("Search", 300, 6, 6)]}
        entityColumnLabel="קמפיין"
        currency="₪"
        wooTotals={woo}
      />,
    );
    const leads = screen.getByRole("region", { name: "קמפייני לידים" });
    expect(headers(leads)).toContain("לידים");
    expect(footer(leads)[3]).toBe("6");
  });
});
