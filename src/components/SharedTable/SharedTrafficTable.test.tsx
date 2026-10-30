import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SharedTrafficTable } from "./SharedTrafficTable";

const row = (name: string, spend: number, clicks: number) => ({
  name,
  spend,
  impressions: 1000,
  clicks,
  leads: 0,
  purchases: 0,
  revenue: 0,
  addToCart: 0,
});

describe("SharedTrafficTable", () => {
  it("shows clicks, CTR and cost per click with a total row", () => {
    render(
      <SharedTrafficTable
        rows={[row("Blog", 100, 50), row("Promo", 60, 30)]}
        entityColumnLabel="קמפיין"
        formatCurrency={(value) => `₪${value}`}
        formatNumber={(value) => String(value)}
      />,
    );
    expect(screen.getByText("קמפייני תנועה")).toBeTruthy();
    const cells = (name: string) =>
      [...(screen.getByText(name).closest("tr")?.children ?? [])].map(
        (cell) => cell.textContent,
      );
    expect(cells("Blog")).toStrictEqual([
      "Blog",
      "₪100",
      "1000",
      "50",
      "5.00%",
      "₪2",
    ]);
    expect(cells('סה"כ')).toStrictEqual([
      'סה"כ',
      "₪160",
      "2000",
      "80",
      "4.00%",
      "₪2",
    ]);
  });
});
