import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatCurrency, formatUnitCost } from "@/lib/currency";
import type { FacebookFollowerTotals } from "@/lib/facebookFollowers";
import { SharedLeadsTable } from "./SharedLeadsTable";

/** A leads row with fixed delivery. */
function row(
  name: string,
  spend: number,
  leads: number,
  followers?: FacebookFollowerTotals,
) {
  return { name, spend, impressions: 1000, clicks: 50, leads, followers };
}

/** Renders the table in shekels with plain numbers. */
function renderTable(
  rows: Array<ReturnType<typeof row>>,
  results?: "leads" | "conversions",
) {
  return render(
    <SharedLeadsTable
      rows={rows}
      entityColumnLabel="קמפיין"
      formatCurrency={(value) => formatCurrency(value, "ILS")}
      formatUnitCost={(value) => formatUnitCost(value, "ILS")}
      formatNumber={(value) => String(value)}
      results={results}
    />,
  );
}

/** A row's cell texts, without the bidi marks and no-break space of he-IL. */
function cells(name: string) {
  return [...(screen.getByText(name).closest("tr")?.children ?? [])].map(
    (cell) => cell.textContent?.replace(/\u200f/g, "").replace(/\u00a0/g, " "),
  );
}

describe("SharedLeadsTable", () => {
  it("shows leads and cost per lead with a total row", () => {
    renderTable([row("Form", 100, 10), row("Quiet", 50, 0)]);
    expect(screen.getByText("קמפייני לידים")).toBeTruthy();
    expect(screen.queryByText("עוקבים חדשים")).toBeNull();
    expect(cells("Form")).toStrictEqual([
      "Form",
      "100 ₪",
      "1000",
      "50",
      "10",
      "10 ₪",
    ]);
    expect(cells("Quiet")[5]).toBe("—");
    expect(cells('סה"כ')).toStrictEqual([
      'סה"כ',
      "150 ₪",
      "2000",
      "100",
      "10",
      "15 ₪",
    ]);
  });

  it("adds the follower columns once a campaign sends people to a profile", () => {
    renderTable([
      row("Instagram", 120, 6, {
        newFollowers: 40,
        followerSpend: 120,
        profileTraffic: true,
      }),
      row("Form", 100, 10),
    ]);
    expect(cells("Instagram").slice(6)).toStrictEqual(["40", "3.00 ₪"]);
    expect(cells("Form").slice(6)).toStrictEqual(["—", "—"]);
    expect(cells('סה"כ').slice(6)).toStrictEqual(["40", "3.00 ₪"]);
  });

  it("names Google Ads results conversions", () => {
    renderTable([row("Search", 100, 4)], "conversions");
    expect(screen.getByText("המרות")).toBeTruthy();
    expect(screen.getByText("עלות להמרה")).toBeTruthy();
  });
});
