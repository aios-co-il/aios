import { describe, expect, it } from "vitest";
import type { ReportScopeData } from "../data/reportData";
import {
  emptyReportFigures,
  type ReportFigures,
} from "../metrics/reportFigures";
import { chartMetrics } from "./chartWidget";
import type { ReportWidget } from "./reportLayout";
import { isWidgetVisible, widgetRuns } from "./widgetVisibility";

/** Figures with the given fields over zeroes. */
function figures(fields: Partial<ReportFigures>): ReportFigures {
  return { ...emptyReportFigures(), ...fields };
}

/** A scope whose channels and days all have these figures. */
function scopeOf(f: ReportFigures): ReportScopeData {
  return {
    figures: f,
    previous: null,
    channels: [{ channel: "facebook", figures: f }],
    daily: [
      { date: "2026-11-01", figures: f },
      { date: "2026-11-02", figures: f },
    ],
    campaigns: [],
  };
}

const SALES_TREND: Extract<ReportWidget, { kind: "trend" }> = {
  id: "ecommerce:trend",
  kind: "trend",
  metric: "revenue",
  compare: "spend",
  fallback: { metric: "purchases" },
};

describe("chartMetrics", () => {
  it("charts revenue against spend when purchases carry a value", () => {
    const scope = scopeOf(figures({ spend: 10, purchases: 2, revenue: 50 }));
    expect(chartMetrics(SALES_TREND, scope)).toEqual({
      metric: "revenue",
      second: "spend",
    });
  });

  it("falls back to purchases when no day can measure revenue", () => {
    const scope = scopeOf(figures({ spend: 10, purchases: 2 }));
    expect(chartMetrics(SALES_TREND, scope)).toEqual({ metric: "purchases" });
  });

  it("falls back to purchases when the only valued day had no purchases", () => {
    const scope: ReportScopeData = {
      ...scopeOf(figures({ spend: 10, purchases: 2 })),
      daily: [
        { date: "2026-11-01", figures: figures({ spend: 5 }) },
        { date: "2026-11-02", figures: figures({ spend: 5, purchases: 2 }) },
      ],
    };
    expect(chartMetrics(SALES_TREND, scope)).toEqual({ metric: "purchases" });
  });
});

describe("isWidgetVisible", () => {
  it("hides a sessions trend without Analytics and Carmen where the report does not offer her", () => {
    const scope = scopeOf(figures({ spend: 10 }));
    const sessions: ReportWidget = {
      id: "s",
      kind: "trend",
      metric: "sessions",
    };
    expect(isWidgetVisible(sessions, scope, { askCarmen: false })).toBe(false);
    expect(
      isWidgetVisible({ id: "c", kind: "insight" }, scope, {
        askCarmen: false,
      }),
    ).toBe(false);
    expect(
      isWidgetVisible({ id: "c", kind: "insight" }, scope, { askCarmen: true }),
    ).toBe(true);
  });
});

describe("widgetRuns", () => {
  it("pairs chart cards and gives a third its own row", () => {
    const widgets: Array<ReportWidget> = [
      { id: "k", kind: "kpis", metrics: ["spend"] },
      { id: "c", kind: "channels", metric: "spend" },
      { id: "t1", kind: "trend", metric: "spend" },
      { id: "t2", kind: "trend", metric: "sessions" },
      { id: "i", kind: "insight" },
    ];
    expect(widgetRuns(widgets).map((run) => run.map((w) => w.id))).toEqual([
      ["k"],
      ["c", "t1"],
      ["t2"],
      ["i"],
    ]);
  });
});
