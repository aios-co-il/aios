import { describe, expect, it } from "vitest";
import { REPORT_METRICS } from "../metrics/reportMetrics";
import {
  defaultReportLayout,
  GOAL_CAMPAIGN_COLUMNS,
  GOAL_KPI_METRICS,
  type ReportLayout,
} from "./reportLayout";

/** The delivery row's metrics. */
function kpisOf(layout: ReportLayout) {
  const widget = layout.sections[0].widgets[0];
  return widget.kind === "kpis" ? widget.metrics : [];
}

/** Each section's scope and widget kinds. */
function outline(layout: ReportLayout) {
  return layout.sections.map((section) => [
    section.scope,
    section.widgets.map((widget) => widget.kind),
  ]);
}

describe("defaultReportLayout", () => {
  it("shows a single goal as delivery, that goal and Carmen", () => {
    expect(outline(defaultReportLayout(["leads"]))).toEqual([
      ["all", ["kpis", "trend", "trend"]],
      ["leads", ["kpis", "channels", "trend", "campaigns"]],
      ["all", ["insight"]],
    ]);
  });

  it("gives each goal its own section, in report order", () => {
    const layout = defaultReportLayout(["traffic", "ecommerce", "leads"]);
    expect(layout.sections.map((section) => section.scope)).toEqual([
      "all",
      "ecommerce",
      "leads",
      "traffic",
      "all",
    ]);
    expect(outline(layout)[0]).toEqual([
      "all",
      ["kpis", "channels", "trend", "trend"],
    ]);
  });

  it("puts sessions in the delivery row unless a traffic section shows them", () => {
    expect(kpisOf(defaultReportLayout(["ecommerce"]))).toContain("sessions");
    expect(kpisOf(defaultReportLayout(["traffic"]))).not.toContain("sessions");
  });

  it("uses each goal's default metrics and columns", () => {
    const [, sales] = defaultReportLayout(["ecommerce"]).sections;
    expect(sales.widgets[0]).toEqual({
      id: "ecommerce:kpis",
      kind: "kpis",
      metrics: GOAL_KPI_METRICS.ecommerce,
    });
    expect(sales.widgets[3]).toEqual({
      id: "ecommerce:campaigns",
      kind: "campaigns",
      metrics: GOAL_CAMPAIGN_COLUMNS.ecommerce,
    });
  });

  it("keeps ROAS and the store comparison in the sales block", () => {
    expect(GOAL_KPI_METRICS.ecommerce).toEqual(
      expect.arrayContaining(["roas", "addToCart", "gaRevenue", "adsRevenue"]),
    );
  });

  it("only offers each block metrics of its scope", () => {
    for (const [goal, metrics] of Object.entries(GOAL_KPI_METRICS)) {
      for (const key of metrics) {
        expect(REPORT_METRICS[key].scopes).toContain(goal);
      }
    }
  });

  it("has unique widget ids", () => {
    const ids = defaultReportLayout(["ecommerce", "leads", "traffic"])
      .sections.flatMap((section) => section.widgets)
      .map((widget) => widget.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shows delivery and Carmen without campaigns", () => {
    expect(outline(defaultReportLayout([]))).toEqual([
      ["all", ["kpis", "channels", "trend", "trend"]],
      ["all", ["insight"]],
    ]);
  });
});
