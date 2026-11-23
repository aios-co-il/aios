import { describe, expect, it } from "vitest";
import { formatCurrency, formatUnitCost } from "@/lib/currency";
import {
  mixedCurrencies,
  singleCurrency,
} from "@/lib/dashboardCurrencies.test-fixture";
import { emptyReportFigures, type ReportFigures } from "./reportFigures";
import { readMetric } from "./reportMetrics";
import {
  readReportMetric,
  reportMetricDelta,
  reportMoneyOf,
} from "./reportMoney";

/** Zeroed figures with these values. */
function figures(values: Partial<ReportFigures>): ReportFigures {
  return { ...emptyReportFigures(), ...values };
}

const meta = figures({ spend: 22142, clicks: 1000, leads: 100 });
const google = figures({ spend: 300, clicks: 150, leads: 0 });
const total = figures({ spend: 22442, clicks: 1150, leads: 100 });
const channels = [
  { channel: "facebook" as const, figures: meta },
  { channel: "google_ads" as const, figures: google },
];

describe("readReportMetric", () => {
  it("shows spend per currency instead of adding shekels and dollars", () => {
    const money = reportMoneyOf(channels, mixedCurrencies());

    const reading = readReportMetric("spend", total, money);

    expect(reading.text).toBe(
      `${formatCurrency(22142, "ILS")} · ${formatCurrency(300, "USD")}`,
    );
  });

  it("writes each currency's cost per click and skips one without leads", () => {
    const money = reportMoneyOf(channels, mixedCurrencies());

    expect(readReportMetric("cpc", total, money).text).toBe(
      `${formatUnitCost(22.142, "ILS")} · ${formatUnitCost(2, "USD")}`,
    );
    expect(readReportMetric("cpl", total, money).text).toBe(
      formatCurrency(221.42, "ILS"),
    );
  });

  it("has no ROAS for a store's sales over spend in two currencies", () => {
    const money = reportMoneyOf(channels, mixedCurrencies());
    const withStore = figures({
      ...total,
      store: {
        source: "WooCommerce",
        purchases: 5,
        revenue: 9000,
        addToCart: 0,
        spend: 22442,
      },
    });

    const reading = readReportMetric("roas", withStore, money);

    expect(reading.text).toBe("—");
    expect(reading.hint).toBe("ההוצאה במטבעות שונים");
  });

  it("writes a one-platform scope in that platform's currency", () => {
    const money = reportMoneyOf([channels[0]], mixedCurrencies());

    expect(readReportMetric("spend", meta, money).text).toBe(
      formatCurrency(22142, "ILS"),
    );
  });

  it("reads a single-currency dashboard exactly as before", () => {
    const money = reportMoneyOf(channels, singleCurrency("USD"));

    expect(readReportMetric("spend", total, money)).toStrictEqual(
      readMetric("spend", total, "USD"),
    );
  });
});

describe("reportMetricDelta", () => {
  it("has no change for an amount split by currency", () => {
    const money = reportMoneyOf(channels, mixedCurrencies());

    expect(reportMetricDelta("spend", total, total, money)).toBeUndefined();
    expect(reportMetricDelta("clicks", total, total, money)).toBeDefined();
  });
});
