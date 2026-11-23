import { getCurrencySymbol, type CurrencyCode } from "./currency";
import { goalRoas } from "./dashboardCombinedFigures";
import {
  formatAmounts,
  type AdsChannel,
  type DashboardCurrencies,
} from "./dashboardCurrencies";
import {
  sumMetrics,
  type DashboardAdsPlatform,
  type DashboardGoalMetrics,
  type DashboardGoalRow,
  type DashboardGoalSummary,
} from "./dashboardGoalSummary";

/** One currency's share of a total over platform rows. */
export type GoalMoneyPart = {
  currency: CurrencyCode;
  metrics: DashboardGoalMetrics;
};

/** The ads platform of a goal summary row. */
export function goalRowChannel(platform: DashboardAdsPlatform): AdsChannel {
  return platform === "google_ads" ? "google_ads" : "facebook";
}

/** The currency a platform row's amounts are in. */
export function goalRowCurrency(
  platform: DashboardAdsPlatform,
  currencies: DashboardCurrencies,
): CurrencyCode {
  return currencies.byChannel[goalRowChannel(platform)];
}

/**
 * The rows added up per currency; null when they share one currency, so a
 * total then reads as a single amount exactly as before.
 */
export function goalMoneyParts(
  rows: Array<DashboardGoalRow>,
  currencies: DashboardCurrencies,
): Array<GoalMoneyPart> | null {
  const byCurrency = new Map<CurrencyCode, Array<DashboardGoalRow>>();
  for (const row of rows) {
    const currency = goalRowCurrency(row.platform, currencies);
    byCurrency.set(currency, [...(byCurrency.get(currency) ?? []), row]);
  }
  if (byCurrency.size <= 1) {
    return null;
  }
  return [...byCurrency].map(([currency, own]) => ({
    currency,
    metrics: sumMetrics(own),
  }));
}

/** One goal's rows per currency; null when they share one currency. */
export function goalRowsMoney(
  summary: DashboardGoalSummary,
  goal: DashboardGoalRow["goal"],
  currencies: DashboardCurrencies,
): Array<GoalMoneyPart> | null {
  return goalMoneyParts(
    summary.rows.filter((row) => row.goal === goal),
    currencies,
  );
}

/**
 * An amount per currency side by side ("₪22,142 · $1,234"): `amount` of each
 * part, over `count` when given (a unit cost such as cost per lead). A part
 * whose count is 0 is left out; "-" when none is left.
 */
export function formatGoalMoney(
  parts: Array<GoalMoneyPart>,
  amount: (metrics: DashboardGoalMetrics) => number,
  options: {
    count?: (metrics: DashboardGoalMetrics) => number;
    unitCost?: boolean;
  } = {},
): string {
  const { count } = options;
  const amounts = parts.flatMap(({ currency, metrics }) => {
    if (!count) {
      return [{ currency, value: amount(metrics) }];
    }
    const denominator = count(metrics);
    return denominator > 0
      ? [{ currency, value: amount(metrics) / denominator }]
      : [];
  });
  return formatAmounts(amounts, { unitCost: options.unitCost, empty: "-" });
}

/**
 * How the dashboard's combined sales read in currencies. Without a store, the
 * sales campaigns' own revenue over their spend, per currency (`split`). With
 * a store, its revenue is set against every non-lead campaign's spend, which
 * no single currency measures when those spent in several (`unmeasurable`).
 */
export function goalSalesMoney(
  summary: DashboardGoalSummary,
  hasStore: boolean,
  currencies: DashboardCurrencies,
): { split: Array<GoalMoneyPart> | null; unmeasurable: boolean } {
  if (!hasStore) {
    return {
      split: goalRowsMoney(summary, "ecommerce", currencies),
      unmeasurable: false,
    };
  }
  const nonLead = summary.rows.filter((row) => row.goal !== "leads");
  return {
    split: null,
    unmeasurable: goalMoneyParts(nonLead, currencies) !== null,
  };
}

/** Each currency's ROAS, naming its currency ("2.10 (₪) · 1.50 ($)"); "-" without any. */
export function formatGoalRoas(parts: Array<GoalMoneyPart>): string {
  const texts = parts.flatMap(({ currency, metrics }) => {
    const roas = goalRoas(metrics);
    return roas === null || metrics.spend <= 0
      ? []
      : [`${roas.toFixed(2)} (${getCurrencySymbol(currency)})`];
  });
  return texts.length > 0 ? texts.join(" · ") : "-";
}

/** The lead campaigns' cost per lead per currency; null when they share one currency. */
export function formatMixedCpl(
  summary: DashboardGoalSummary,
  currencies: DashboardCurrencies,
): string | null {
  const parts = goalRowsMoney(summary, "leads", currencies);
  return parts
    ? formatGoalMoney(parts, (m) => m.spend, { count: (m) => m.leads })
    : null;
}

/**
 * The combined sales' measure when their spend is in several currencies
 * (goalSalesMoney): each currency's cost per purchase or ROAS, or "-" when
 * the store's revenue is set against all of them.
 */
export function formatSplitSalesMeasure(
  money: { split: Array<GoalMoneyPart> | null },
  byPurchase: boolean,
): string {
  if (!money.split) {
    return "-";
  }
  return byPurchase
    ? formatGoalMoney(money.split, (m) => m.spend, {
        count: (m) => m.purchases,
      })
    : formatGoalRoas(money.split);
}
