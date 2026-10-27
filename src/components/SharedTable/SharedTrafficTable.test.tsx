import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SharedTrafficTable } from "./SharedTrafficTable";

const row = (
  name: string,
  spend: number,
  clicks: number,
  followers?: { newFollowers: number; profileTraffic: boolean },
) => ({
  name,
  spend,
  impressions: 1000,
  clicks,
  leads: 0,
  purchases: 0,
  revenue: 0,
  addToCart: 0,
  followers,
});
const renderTable = (rows: Array<ReturnType<typeof row>>) =>
  render(
    <SharedTrafficTable
      rows={rows}
      entityColumnLabel="קמפיין"
      formatCurrency={(value) => `₪${value}`}
      formatNumber={(value) => String(value)}
    />,
  );
const cells = (name: string) =>
  [...(screen.getByText(name).closest("tr")?.children ?? [])].map(
    (cell) => cell.textContent,
  );

describe("SharedTrafficTable", () => {
  it("shows clicks, CTR and cost per click with a total row", () => {
    renderTable([row("Blog", 100, 50), row("Promo", 60, 30)]);
    expect(screen.getByText("קמפייני תנועה")).toBeTruthy();
    expect(screen.queryByText("עוקבים חדשים")).toBeNull();
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

  it("adds new followers and cost per follower for Page and profile traffic", () => {
    renderTable([
      row("Profile", 120, 60, { newFollowers: 40, profileTraffic: true }),
      row("New page", 30, 10, { newFollowers: 0, profileTraffic: true }),
      row("Blog", 300, 100, { newFollowers: 0, profileTraffic: false }),
    ]);
    expect(
      screen.getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toStrictEqual([
      "קמפיין",
      "הוצאה",
      "חשיפות",
      "קליקים",
      "CTR",
      "עלות לקליק",
      "עוקבים חדשים",
      "עלות לעוקב",
    ]);
    expect(cells("Profile").slice(-2)).toStrictEqual(["40", "₪3"]);
    expect(cells("New page").slice(-2)).toStrictEqual(["0", "—"]);
    expect(cells("Blog").slice(-2)).toStrictEqual(["0", "—"]);
    // Website traffic spend stays out of the total cost per follower.
    expect(cells('סה"כ').slice(-2)).toStrictEqual(["40", "₪3.75"]);
  });
});
