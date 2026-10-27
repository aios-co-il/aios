import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FacebookFollowerTotals } from "@/lib/facebookFollowers";
import { SharedTrafficTable } from "./SharedTrafficTable";

const row = (
  name: string,
  spend: number,
  clicks: number,
  followers?: FacebookFollowerTotals,
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
const follows = (
  newFollowers: number | null,
  followerSpend: number,
  profileTraffic: boolean,
): FacebookFollowerTotals => ({ newFollowers, followerSpend, profileTraffic });
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

  it("website traffic with a few follows gets no follower columns", () => {
    renderTable([row("Blog", 300, 100, follows(2, 300, false))]);
    expect(screen.queryByText("עוקבים חדשים")).toBeNull();
  });

  it("adds new followers and cost per follower for Page and profile traffic", () => {
    renderTable([
      row("Profile", 120, 60, follows(40, 120, true)),
      row("New page", 30, 10, follows(0, 30, true)),
      row("Older profile", 80, 20, follows(null, 0, true)),
      row("Blog", 300, 100, follows(2, 300, false)),
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
    // Synced before the follower count, so there is no number to show.
    expect(cells("Older profile").slice(-2)).toStrictEqual(["—", "—"]);
    // A website campaign shows its follows but has no cost per follower.
    expect(cells("Blog").slice(-2)).toStrictEqual(["2", "—"]);
    // Neither its spend nor the older row's enters the total cost per follower.
    expect(cells('סה"כ').slice(-2)).toStrictEqual(["42", "₪3.75"]);
  });
});
