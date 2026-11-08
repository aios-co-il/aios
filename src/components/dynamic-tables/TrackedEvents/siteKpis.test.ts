import { describe, expect, it } from "vitest";
import { parseTrackedRatio, purchaseRevenue, ratioFigures } from "./siteKpis";

const tracked = [
  { event: "ticket_valuation", label: "הערכה" },
  { event: "ticket_sold", label: "מכירה" },
];

describe("parseTrackedRatio", () => {
  it("keeps a pair of two different followed events", () => {
    expect(
      parseTrackedRatio(
        { tracked_ratio: { from: "ticket_valuation", to: "ticket_sold" } },
        tracked,
      ),
    ).toEqual({ from: "ticket_valuation", to: "ticket_sold" });
  });

  it("drops a pair whose event is no longer followed", () => {
    expect(
      parseTrackedRatio(
        { tracked_ratio: { from: "ticket_valuation", to: "purchase" } },
        tracked,
      ),
    ).toBeNull();
    expect(parseTrackedRatio({}, tracked)).toBeNull();
  });
});

describe("ratioFigures", () => {
  const pair = { from: "ticket_valuation", to: "ticket_sold" };

  it("uses GA's funnel for the pair once it is in", () => {
    expect(
      ratioFigures(
        pair,
        tracked,
        { ticket_valuation: 54, ticket_sold: 9 },
        {
          fromEvent: "ticket_valuation",
          toEvent: "ticket_sold",
          from: 27,
          to: 6,
        },
      ),
    ).toEqual({
      label: "הערכה ← מכירה",
      done: 6,
      of: 27,
      rate: 6 / 27,
      basis: "people",
    });
  });

  it("falls back to event counts, with no rate when nobody reached the first step", () => {
    const figures = ratioFigures(pair, tracked, { ticket_sold: 2 }, undefined);
    expect(figures.basis).toBe("events");
    expect(figures.rate).toBeNull();
  });
});

describe("ratioFigures with another pair's funnel", () => {
  it("ignores counts that belong to a different pair", () => {
    const figures = ratioFigures(
      { from: "ticket_valuation", to: "ticket_sold" },
      tracked,
      { ticket_valuation: 54, ticket_sold: 9 },
      { fromEvent: "ticket_upload", toEvent: "ticket_sold", from: 80, to: 9 },
    );
    expect(figures.basis).toBe("events");
    expect(figures.of).toBe(54);
  });
});

describe("purchaseRevenue", () => {
  it("sums GA's daily purchase revenue only", () => {
    expect(
      purchaseRevenue([
        {
          _source: "google_analytics",
          data: { report_type: "daily", purchase_value: 2062 },
        },
        {
          _source: "google_analytics",
          data: { report_type: "daily", purchase_value: 1396 },
        },
        {
          _source: "google_analytics",
          data: { report_type: "daily_source", purchase_value: 999 },
        },
        { _source: "facebook_insights", data: { report_type: "daily" } },
      ]),
    ).toBe(3458);
  });
});
