import { Bar } from "recharts";
import {
  formatCurrency,
  getCurrencySymbol,
  type CurrencyCode,
} from "@/lib/currency";
import {
  chartCurrencies,
  formatMixedSpend,
  moneyFormatters,
  spendKeyOf,
  type DashboardCurrencies,
} from "@/lib/dashboardCurrencies";
import type { DashboardStore } from "@/lib/dashboardCombinedFigures";
import { formatMixedCpl, goalSalesMoney } from "@/lib/dashboardGoalMoney";
import type { DashboardGoalSummary } from "@/lib/dashboardGoalSummary";

const SPEND_BAR_COLORS = ["#3b82f6", "#8b5cf6"];

type MoneyViewInput = {
  currencies: DashboardCurrencies;
  /** Each source's spend in the tab, as the page adds it up. */
  spendBySource: Array<{ source: string; spend: number }>;
  goals: DashboardGoalSummary;
  store: DashboardStore | null;
  /** The page's single-currency figures, shown when the platforms share one. */
  totalSpend: number;
  leadCpl: number;
};

/**
 * What the internal dashboard and its share link show in currencies: each
 * platform's formatters, and the "All" tab's totals, ROAS and daily spend
 * bars per currency when the platforms' currencies differ. A dashboard of one
 * currency reads exactly as before.
 */
export function dashboardMoneyView(input: MoneyViewInput) {
  const { currencies } = input;
  const primary = currencies.primary;
  const chartSpend = currencies.mixed ? chartCurrencies(currencies) : [];
  return {
    facebook: moneyFormatters(currencies.byChannel.facebook),
    google: moneyFormatters(currencies.byChannel.google_ads),
    totalSpendText:
      formatMixedSpend(input.spendBySource, currencies) ??
      formatCurrency(input.totalSpend, primary),
    leadCplText:
      formatMixedCpl(input.goals, currencies) ??
      formatCurrency(input.leadCpl, primary),
    salesMoney: goalSalesMoney(input.goals, input.store !== null, currencies),
    spendBars: () => spendBars(chartSpend),
    formatChartAmount: (value: number, key: unknown) =>
      formatChartAmount(value, key, chartSpend, primary),
  };
}

/**
 * The daily chart's spend bars: one per currency on a mixed dashboard, one
 * spend bar otherwise. Recharts reads bars from the chart's direct children,
 * so the page places these elements itself instead of a wrapping component.
 */
function spendBars(chartSpend: Array<CurrencyCode>) {
  if (chartSpend.length === 0) {
    return <Bar dataKey="spend" name="הוצאה" fill={SPEND_BAR_COLORS[0]} />;
  }
  return chartSpend.map((currency, index) => (
    <Bar
      key={currency}
      dataKey={spendKeyOf(currency)}
      name={`הוצאה (${getCurrencySymbol(currency)})`}
      fill={SPEND_BAR_COLORS[index % SPEND_BAR_COLORS.length]}
    />
  ));
}

/** A chart value in its series' currency: a currency's spend, else the primary. */
function formatChartAmount(
  value: number,
  key: unknown,
  chartSpend: Array<CurrencyCode>,
  primary: CurrencyCode,
): string {
  const currency = chartSpend.find((code) => spendKeyOf(code) === key);
  return formatCurrency(value, currency ?? primary);
}
