import { format, parseISO } from "date-fns";
import { LineChart } from "lucide-react";
import { getCurrencySymbol, type CurrencyCode } from "@/lib/currency";
import type { DashboardCurrencies } from "@/lib/dashboardCurrencies";
import { ReportTrendChart } from "../ReportTrendChart";
import type { ReportScopeData } from "../data/reportData";
import {
  addAdsFigures,
  emptyReportFigures,
  type ReportFigures,
} from "../metrics/reportFigures";
import {
  formatMetricValue,
  isMetricAvailable,
  REPORT_METRICS,
} from "../metrics/reportMetrics";
import type { ReportMetricKey } from "../metrics/reportMetricTypes";
import { isSplitMetric, reportMoneyOf } from "../metrics/reportMoney";

interface MetricTrendChartProps {
  scope: ReportScopeData;
  metric: ReportMetricKey;
  compare?: ReportMetricKey;
  currencies: DashboardCurrencies;
}

type TrendRow = { day: string; value: number | null; compare: number | null };

/**
 * One metric day by day, with an optional second line. Nothing when the
 * scope has no days or no source for the metric (sessions without Analytics).
 * When the scope's platforms use different currencies, an amount is drawn as
 * a line per currency instead of one line that adds them.
 */
export function MetricTrendChart({
  scope,
  metric,
  compare,
  currencies,
}: MetricTrendChartProps) {
  const main = REPORT_METRICS[metric];
  const money = reportMoneyOf(scope.channels, currencies);
  if (isSplitMetric(metric, scope.figures, money)) {
    return (
      <CurrencyTrendChart
        scope={scope}
        metric={metric}
        currencies={currencies}
      />
    );
  }
  // The chart has one axis and one formatter, so a second line must share
  // the metric's unit (revenue against spend, not against clicks).
  const candidate = compare ? REPORT_METRICS[compare] : null;
  const second =
    candidate?.format === main.format &&
    compare &&
    !isSplitMetric(compare, scope.figures, money)
      ? candidate
      : null;
  const days = scope.daily.filter(({ figures }) =>
    isMetricAvailable(metric, figures),
  );
  if (days.length < 2) {
    return null;
  }
  const currency =
    main.money?.(scope.figures) === "site" ? money.site : money.ads;
  const data: Array<TrendRow> = days.map(({ date, figures }) => ({
    day: format(parseISO(date), "dd/MM"),
    value: main.compute(figures),
    compare: second ? second.compute(figures) : null,
  }));
  return (
    <ReportTrendChart
      title={
        second
          ? `${main.label} מול ${second.label}`
          : `${main.label} לאורך התקופה`
      }
      icon={LineChart}
      data={data}
      xKey="day"
      valueKey="value"
      valueName={main.label}
      compare={second ? { key: "compare", name: second.label } : undefined}
      format={(value) => formatMetricValue(main.format, value, currency)}
      height={220}
    />
  );
}

/**
 * An ads amount day by day, a line per currency: the first currency in the
 * accent, the second in the neutral, each written in its own currency. Spend
 * set against the site's sales has no currency to draw, so it shows nothing.
 */
function CurrencyTrendChart({
  scope,
  metric,
  currencies,
}: {
  scope: ReportScopeData;
  metric: ReportMetricKey;
  currencies: DashboardCurrencies;
}) {
  const main = REPORT_METRICS[metric];
  if (main.money?.(scope.figures) !== "ads") {
    return null;
  }
  const [first, second] = currencyDays(scope, currencies);
  const dates = [
    ...new Set([...first.days.keys(), ...second.days.keys()]),
  ].sort();
  if (dates.length < 2) {
    return null;
  }
  function valueOf(days: Map<string, ReportFigures>, date: string) {
    const figures = days.get(date);
    return figures ? main.compute(figures) : null;
  }
  const data: Array<TrendRow> = dates.map((date) => ({
    day: format(parseISO(date), "dd/MM"),
    value: valueOf(first.days, date),
    compare: valueOf(second.days, date),
  }));
  function nameOf(currency: CurrencyCode) {
    return `${main.label} (${getCurrencySymbol(currency)})`;
  }
  return (
    <ReportTrendChart
      title={`${main.label} לאורך התקופה, לפי מטבע`}
      icon={LineChart}
      data={data}
      xKey="day"
      valueKey="value"
      valueName={nameOf(first.currency)}
      compare={{
        key: "compare",
        name: nameOf(second.currency),
        format: (value) =>
          formatMetricValue(main.format, value, second.currency),
      }}
      format={(value) => formatMetricValue(main.format, value, first.currency)}
      axisFormat={(value) => Math.round(value).toLocaleString("he-IL")}
      height={220}
    />
  );
}

/** Each currency's days, the channels of one currency added up; two currencies. */
function currencyDays(
  scope: ReportScopeData,
  currencies: DashboardCurrencies,
): Array<{ currency: CurrencyCode; days: Map<string, ReportFigures> }> {
  const byCurrency = new Map<CurrencyCode, Map<string, ReportFigures>>();
  for (const { channel, daily } of scope.dailyByChannel) {
    const currency = currencies.byChannel[channel];
    const days = byCurrency.get(currency) ?? new Map();
    for (const { date, figures } of daily) {
      days.set(
        date,
        addAdsFigures(days.get(date) ?? emptyReportFigures(), figures),
      );
    }
    byCurrency.set(currency, days);
  }
  return [...byCurrency].map(([currency, days]) => ({ currency, days }));
}
