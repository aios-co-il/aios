import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoogleAdsGoalTable } from "./GoogleAdsGoalTable";
import { googlePreviousPeriod } from "./googlePreviousPeriod";

/** One stored campaign-level row of a previous day. */
function day(campaign_id: string, data: Record<string, unknown>) {
  return {
    data: {
      date: "2026-10-01",
      entity_level: "campaign",
      campaign_id,
      campaign_name: campaign_id,
      ...data,
    },
  };
}

/** A row's cell texts, without the bidi marks and no-break spaces of he-IL. */
function cells(row: HTMLElement | null) {
  return [...(row?.children ?? [])].map((cell) =>
    cell.textContent?.replace(/\u200f/g, "").replace(/\u00a0/g, " "),
  );
}

describe("googlePreviousPeriod", () => {
  it("adds each campaign's days and keeps totals per goal", () => {
    const previous = googlePreviousPeriod(
      [
        day("search", { cost: 100, conversions: 4 }),
        day("search", { cost: 50, conversions: 1 }),
        day("shop", { cost: 80, conversions: 2, conversions_value: 400 }),
      ],
      "campaign",
      (data) => (data.campaign_id === "shop" ? "ecommerce" : "leads"),
    );
    expect(previous.leads.byKey.get("search")).toMatchObject({
      cost: 150,
      conversions: 5,
    });
    expect(previous.leads.total).toMatchObject({ cost: 150, conversions: 5 });
    expect(previous.ecommerce.total).toMatchObject({
      cost: 80,
      conversions_value: 400,
    });
  });
});

describe("GoogleAdsGoalTable previous period", () => {
  it("shows leads, cost and cost per lead against the previous period", () => {
    const metrics = { impressions: 1000, clicks: 40, conversions_value: 0 };
    render(
      <GoogleAdsGoalTable
        goal="leads"
        rows={[
          {
            key: "search",
            name: "Search",
            ...metrics,
            cost: 300,
            conversions: 10,
          },
        ]}
        entityColumnLabel="קמפיין"
        currency="₪"
        previous={{
          byKey: new Map([
            ["search", { ...metrics, cost: 300, conversions: 6 }],
          ]),
          total: { ...metrics, cost: 300, conversions: 6 },
        }}
      />,
    );
    expect(screen.getAllByText("תקופה קודמת")).toHaveLength(3);
    // Leads 10 vs 6, cost ₪300 vs ₪300, cost per lead ₪30 vs ₪50.
    expect(cells(screen.getByText("Search").closest("tr"))).toStrictEqual([
      "Search",
      "1,000",
      "40",
      "10",
      "▲ 6",
      "₪300",
      "₪300",
      "₪30",
      "▼ ₪50",
    ]);
  });
});
