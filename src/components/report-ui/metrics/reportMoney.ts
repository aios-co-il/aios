import { getCurrencySymbol, type CurrencyCode } from "@/lib/currency";
import type { DashboardCurrencies } from "@/lib/dashboardCurrencies";
import type { ReportChannel } from "../data/reportData";
import {
  addAdsFigures,
  emptyReportFigures,
  type ReportFigures,
} from "./reportFigures";
import {
  metricDelta,
  readMetric,
  REPORT_METRICS,
  type ReportMetricReading,
} from "./reportMetrics";
import type { ReportMetricKey, ReportMoneyKind } from "./reportMetricTypes";

/**
 * The currencies one set of figures is written in: the site's, the ads
 * platforms' when they share one, and else each currency's own figures,
 * which are shown side by side and never added together.
 */
export type ReportMoney = {
  site: CurrencyCode;
  ads: CurrencyCode;
  /** Each currency's figures; null when the platforms share one currency. */
  split: Array<{ currency: CurrencyCode; figures: ReportFigures }> | null;
};

/** The money of figures made of these channels' parts. */
export function reportMoneyOf(
  parts: Array<{ channel: ReportChannel; figures: ReportFigures }>,
  currencies: DashboardCurrencies,
): ReportMoney {
  const byCurrency = new Map<CurrencyCode, ReportFigures>();
  for (const { channel, figures } of parts) {
    const currency = currencies.byChannel[channel];
    byCurrency.set(
      currency,
      addAdsFigures(byCurrency.get(currency) ?? emptyReportFigures(), figures),
    );
  }
  const split = [...byCurrency].map(([currency, figures]) => ({
    currency,
    figures,
  }));
  return {
    site: currencies.primary,
    ads: split[0]?.currency ?? currencies.primary,
    split: split.length > 1 ? split : null,
  };
}

/** The money of one channel's figures, such as a campaign row. */
export function channelMoney(
  channel: ReportChannel,
  currencies: DashboardCurrencies,
): ReportMoney {
  return {
    site: currencies.primary,
    ads: currencies.byChannel[channel],
    split: null,
  };
}

/** Whether the metric's value would add amounts of different currencies. */
export function isSplitMetric(
  key: ReportMetricKey,
  figures: ReportFigures,
  money: ReportMoney,
): boolean {
  const kind = moneyKind(key, figures);
  return money.split !== null && (kind === "ads" || kind === "spendVsSite");
}

/**
 * The metric written in its currency. With several currencies, an ads amount
 * shows per currency ("₪22,142 · $1,234") and spend set against the site's
 * sales shows a dash, as no single currency can measure it.
 */
export function readReportMetric(
  key: ReportMetricKey,
  figures: ReportFigures,
  money: ReportMoney,
): ReportMetricReading {
  const kind = moneyKind(key, figures);
  const currency =
    kind === "ads" || kind === "spendVsSite" ? money.ads : money.site;
  if (!money.split || kind === null || kind === "site") {
    return readMetric(key, figures, currency);
  }
  if (kind === "spendVsSite") {
    return {
      metric: REPORT_METRICS[key],
      value: null,
      text: "—",
      hint: "ההוצאה במטבעות שונים",
    };
  }
  return splitReading(key, figures, money.split);
}

/** The change against the previous period; none for an amount split by currency. */
export function reportMetricDelta(
  key: ReportMetricKey,
  current: ReportFigures,
  previous: ReportFigures | null,
  money: ReportMoney,
) {
  return isSplitMetric(key, current, money)
    ? undefined
    : metricDelta(key, current, previous);
}

/** The metric's money kind for these figures; null for a count. */
function moneyKind(
  key: ReportMetricKey,
  figures: ReportFigures,
): ReportMoneyKind | null {
  return REPORT_METRICS[key].money?.(figures) ?? null;
}

/** Each currency's reading side by side; a ratio names its currency. */
function splitReading(
  key: ReportMetricKey,
  figures: ReportFigures,
  split: NonNullable<ReportMoney["split"]>,
): ReportMetricReading {
  const metric = REPORT_METRICS[key];
  const parts = split.flatMap(({ currency, figures: own }) => {
    const reading = readMetric(key, own, currency);
    if (reading.value === null) {
      return [];
    }
    return [
      metric.format === "ratio"
        ? `${reading.text} (${getCurrencySymbol(currency)})`
        : reading.text,
    ];
  });
  if (parts.length === 0) {
    return readMetric(key, figures, split[0].currency);
  }
  return { metric, value: null, text: parts.join(" · "), hint: null };
}
