import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FacebookLeadsTable } from "./FacebookLeadsTable";
import { FacebookSalesTable } from "./FacebookSalesTable/FacebookSalesTable";
import { FacebookTrafficTable } from "./FacebookTrafficTable";
import { facebookPreviousPeriod } from "./facebookPreviousPeriod";
import {
  type FacebookReportCampaign,
  type FacebookReportEntry,
} from "./facebookReportCampaigns";
import { emptyFacebookFollowers } from "@/lib/facebookFollowers";
import { emptyFacebookResultTotals } from "@/lib/facebookResultMetric";

/** A report row with only the numbers a test sets. */
function campaign(
  name: string,
  numbers: Partial<FacebookReportCampaign>,
): FacebookReportCampaign {
  return {
    name,
    impressions: 1000,
    clicks: 50,
    leads: 0,
    spend: 0,
    purchases: 0,
    purchase_value: 0,
    add_to_cart: 0,
    conversations: 0,
    result: emptyFacebookResultTotals(),
    followers: emptyFacebookFollowers(),
    off: false,
    ...numbers,
  };
}

/** A row's cell texts, without the bidi marks and no-break spaces of he-IL. */
function cells(row: HTMLElement | null) {
  return [...(row?.children ?? [])].map((cell) =>
    cell.textContent?.replace(/\u200f/g, "").replace(/\u00a0/g, " "),
  );
}

const current: Array<FacebookReportEntry> = [
  ["a", campaign("Form", { leads: 12, spend: 240 })],
  ["b", campaign("New", { leads: 3, spend: 90 })],
];
const previous = facebookPreviousPeriod({
  ecommerce: [],
  leads: [["a", campaign("Form", { leads: 8, spend: 240 })]],
  traffic: [],
});

describe("previous period columns in the Facebook tables", () => {
  it("are absent while the comparison is off", () => {
    render(
      <FacebookLeadsTable rows={current} entityHeader="קמפיין" currency="₪" />,
    );
    expect(screen.queryByText("תקופה קודמת")).toBeNull();
  });

  it("show each lead metric's previous value with its arrow and colour", () => {
    render(
      <FacebookLeadsTable
        rows={current}
        entityHeader="קמפיין"
        currency="₪"
        previous={previous.leads}
      />,
    );
    expect(screen.getAllByText("תקופה קודמת")).toHaveLength(3);
    const row = screen.getByText("Form").closest("tr");
    // Leads 12 vs 8, spend ₪240 vs ₪240, cost per lead ₪20 vs ₪30.
    expect(cells(row)).toStrictEqual([
      "Form",
      "1,000",
      "50",
      "12",
      "▲ 8",
      "₪240",
      "₪240",
      "₪20",
      "▼ ₪30",
    ]);
    const [, , , , leadsPrev, , , , cplPrev] = [...(row?.children ?? [])];
    expect(leadsPrev.className).toContain("text-green-600");
    expect(cplPrev.className).toContain("text-green-600");
    // A campaign that did not run in the previous period has nothing to compare.
    const fresh = screen.getByText("New").closest("tr");
    expect(cells(fresh)[4]).toBe("—");
    // The total compares the whole table: 15 leads now against 8.
    const total = screen.getByText("סה״כ").closest("tr");
    expect(cells(total)[4]).toBe("▲ 8");
  });

  it("compare purchases and cost per purchase in a sales table without value", () => {
    render(
      <FacebookSalesTable
        rows={[["s", campaign("Course", { purchases: 3, spend: 90 })]]}
        entityHeader="קמפיין"
        currency="₪"
        previous={
          facebookPreviousPeriod({
            ecommerce: [
              ["s", campaign("Course", { purchases: 5, spend: 100 })],
            ],
            leads: [],
            traffic: [],
          }).ecommerce
        }
      />,
    );
    const row = screen.getByText("Course").closest("tr");
    const texts = cells(row);
    // Spend ₪90 vs ₪100, purchases 3 vs 5 (worse), cost per purchase ₪30
    // vs ₪20 (worse).
    expect(texts.slice(4)).toStrictEqual([
      "▼ ₪100",
      "3",
      "▼ 5",
      "₪30",
      "▲ ₪20",
    ]);
    const purchasesPrev = row?.children[6];
    expect(purchasesPrev?.className).toContain("text-red-600");
  });

  it("shows a dash for followers the previous period did not measure", () => {
    /** Aimee-style profile traffic with this follower count. */
    function profile(newFollowers: number | null) {
      return campaign("Profile", {
        clicks: 80,
        spend: 120,
        followers: { newFollowers, followerSpend: 120, profileTraffic: true },
      });
    }
    render(
      <FacebookTrafficTable
        rows={[["p", profile(40)]]}
        entityHeader="קמפיין"
        currency="₪"
        previous={
          facebookPreviousPeriod({
            ecommerce: [],
            leads: [],
            traffic: [["p", profile(null)]],
          }).traffic
        }
      />,
    );
    const texts = cells(screen.getByText("Profile").closest("tr"));
    // New followers 40, then its previous value: unknown, not 0.
    expect(texts[texts.indexOf("40") + 1]).toBe("—");
  });
});
