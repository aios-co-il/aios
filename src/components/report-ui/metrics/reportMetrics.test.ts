import { describe, expect, it } from "vitest";
import { emptyReportFigures, type ReportFigures } from "./reportFigures";
import {
  isMetricAvailable,
  metricDelta,
  readMetric,
  REPORT_METRICS,
} from "./reportMetrics";
import { REPORT_METRIC_KEYS } from "./reportMetricTypes";

/** Figures with the given fields over zeroes. */
function figures(fields: Partial<ReportFigures>): ReportFigures {
  return { ...emptyReportFigures(), ...fields };
}

/** A metric's computed value. */
function value(key: keyof typeof REPORT_METRICS, f: ReportFigures) {
  return REPORT_METRICS[key].compute(f);
}

describe("REPORT_METRICS", () => {
  it("defines every key once, under its own key", () => {
    for (const key of REPORT_METRIC_KEYS) {
      expect(REPORT_METRICS[key].key).toBe(key);
    }
    expect(Object.keys(REPORT_METRICS)).toHaveLength(REPORT_METRIC_KEYS.length);
  });
});

describe("delivery metrics", () => {
  const delivery = figures({ spend: 500, impressions: 20000, clicks: 400 });

  it("computes CTR, CPC and CPM", () => {
    expect(value("ctr", delivery)).toBe(0.02);
    expect(value("cpc", delivery)).toBe(1.25);
    expect(value("cpm", delivery)).toBe(25);
  });

  it("cannot measure rates without impressions or clicks", () => {
    expect(value("ctr", figures({ spend: 5 }))).toBeNull();
    expect(value("cpc", figures({ spend: 5 }))).toBeNull();
    expect(value("cpm", figures({ spend: 5 }))).toBeNull();
  });

  it("gives no cost per lead without leads, not 0", () => {
    expect(value("cpl", figures({ spend: 300, leads: 12 }))).toBe(25);
    const reading = readMetric("cpl", figures({ spend: 300 }), "ILS");
    expect(reading.text).toBe("—");
    expect(reading.hint).toBe("אין לידים בתקופה");
  });

  it("shows sessions only with Analytics", () => {
    expect(isMetricAvailable("sessions", figures({}))).toBe(false);
    const site = figures({
      analytics: { sessions: 900, revenue: 0, purchases: 0, addToCart: 0 },
    });
    expect(isMetricAvailable("sessions", site)).toBe(true);
    expect(value("sessions", site)).toBe(900);
  });
});

describe("sales metrics", () => {
  it("measures the campaigns' own sales without a store", () => {
    const sales = figures({ spend: 1000, purchases: 10, revenue: 4000 });
    expect(value("revenue", sales)).toBe(4000);
    expect(value("roas", sales)).toBe(4);
    expect(value("costPerPurchase", sales)).toBe(100);
    expect(readMetric("revenue", sales, "ILS").hint).toBe(
      "לפי דיווח הפלטפורמות",
    );
  });

  it("keeps a ROAS of 0 for a sales campaign that sold nothing", () => {
    expect(value("roas", figures({ spend: 800 }))).toBe(0);
  });

  it("shows cost per purchase instead of ROAS when purchases carry no value", () => {
    const free = figures({ spend: 600, purchases: 30 });
    expect(value("roas", free)).toBeNull();
    expect(readMetric("roas", free, "ILS").hint).toBe(
      "הרכישות ללא ערך · נמדד בעלות לרכישה",
    );
    expect(value("costPerPurchase", free)).toBe(20);
  });

  it("sets the store's sales against the spend it is measured on", () => {
    const store = figures({
      spend: 4000,
      purchases: 9,
      revenue: 9000,
      store: {
        source: "WooCommerce",
        revenue: 13000,
        purchases: 26,
        addToCart: 0,
        spend: 2600,
      },
      analytics: { sessions: 10, revenue: 8000, purchases: 20, addToCart: 70 },
    });
    expect(value("revenue", store)).toBe(13000);
    expect(value("roas", store)).toBe(5);
    expect(value("purchases", store)).toBe(26);
    expect(value("costPerPurchase", store)).toBe(100);
    expect(value("adsRevenue", store)).toBe(9000);
    expect(value("gaRevenue", store)).toBe(8000);
    expect(value("wooOrders", store)).toBe(26);
    expect(value("addToCart", store)).toBe(70);
    expect(readMetric("revenue", store, "ILS").hint).toBe("WooCommerce");
  });

  it("offers the store comparisons only when there is a store", () => {
    const campaign = figures({ spend: 10, revenue: 50, purchases: 1 });
    expect(isMetricAvailable("adsRevenue", campaign)).toBe(false);
    expect(isMetricAvailable("wooRevenue", campaign)).toBe(false);
    expect(isMetricAvailable("gaRevenue", campaign)).toBe(false);
  });

  it("leaves add-to-cart out where no source tracks it", () => {
    expect(isMetricAvailable("addToCart", figures({}))).toBe(false);
    const tracked = figures({ addToCartTracked: true, addToCart: 0 });
    expect(isMetricAvailable("addToCart", tracked)).toBe(true);
    expect(value("addToCart", tracked)).toBe(0);
  });
});

describe("metricDelta", () => {
  it("gives the change with the metric's good direction", () => {
    const now = figures({ spend: 300, leads: 20 });
    const before = figures({ spend: 300, leads: 10 });
    expect(metricDelta("leads", now, before)).toEqual({
      value: 1,
      goodWhen: "up",
    });
    expect(metricDelta("cpl", now, before)).toEqual({
      value: -0.5,
      goodWhen: "down",
    });
    expect(metricDelta("spend", now, before)?.goodWhen).toBe("either");
  });

  it("gives none when a period cannot measure it or started at 0", () => {
    const now = figures({ spend: 300, leads: 20 });
    expect(metricDelta("cpl", now, figures({ spend: 100 }))).toBeUndefined();
    expect(metricDelta("leads", now, figures({}))).toBeUndefined();
    expect(metricDelta("leads", now, null)).toBeUndefined();
  });

  it("gives none when the periods take the figure from different sources", () => {
    const platforms = figures({ spend: 100, purchases: 10, revenue: 900 });
    const analytics = figures({
      spend: 100,
      store: {
        source: "Analytics",
        revenue: 300,
        purchases: 2,
        addToCart: 0,
        spend: 100,
      },
    });
    expect(metricDelta("revenue", platforms, analytics)).toBeUndefined();
    expect(metricDelta("roas", platforms, analytics)).toBeUndefined();
    expect(
      metricDelta("costPerPurchase", platforms, analytics),
    ).toBeUndefined();
    expect(metricDelta("spend", platforms, analytics)?.value).toBe(0);
  });
});

describe("readMetric formats", () => {
  const f = figures({ spend: 1234.5, impressions: 1000, clicks: 25 });

  it("writes each format", () => {
    expect(readMetric("spend", f, "ILS").text).toContain("1,235");
    expect(readMetric("cpc", f, "USD").text).toContain("49.38");
    expect(readMetric("ctr", f, "ILS").text).toBe("2.50%");
    expect(readMetric("impressions", f, "ILS").text).toBe("1,000");
    const roas = figures({ spend: 100, revenue: 325, purchases: 3 });
    expect(readMetric("roas", roas, "ILS").text).toBe("3.25");
  });
});
