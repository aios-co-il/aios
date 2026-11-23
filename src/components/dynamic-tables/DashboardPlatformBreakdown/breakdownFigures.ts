import {
  costPerPurchase,
  goalCpl,
  goalRoas,
  purchaseValueUnreported,
  type DashboardCombinedSales,
  type DashboardRevenueSource,
} from "@/lib/dashboardCombinedFigures";
import {
  moneyFormatters,
  type DashboardCurrencies,
} from "@/lib/dashboardCurrencies";
import {
  goalMoneyParts,
  goalRowCurrency,
  goalSalesMoney,
} from "@/lib/dashboardGoalMoney";
import type {
  DashboardGoalRow,
  DashboardGoalSummary,
} from "@/lib/dashboardGoalSummary";
import type { GoogleAdsFormatters } from "../GoogleAdsCampaignSection/types";
import type { PlatformLabelOf } from "./BreakdownCells";

export type BreakdownProps = {
  summary: DashboardGoalSummary;
  /** Combined sales of the total row (combinedDashboardSales). */
  sales: DashboardCombinedSales;
  /** Combined leads of the total row (combinedDashboardLeads). */
  leads: { leads: number; cpl: number };
  /** Null when the total row's revenue is what the sales campaigns report. */
  revenueSource: DashboardRevenueSource | null;
  platformLabel: PlatformLabelOf;
  format: GoogleAdsFormatters;
  /** Each platform's row in its own currency; totals never add currencies. */
  currencies: DashboardCurrencies;
};

export const REVENUE_SOURCE_LABELS: Record<DashboardRevenueSource, string> = {
  WooCommerce: "הכנסות WooCommerce",
  Analytics: "הכנסות מ-Analytics",
};

/** A sales row's figures; null for a row of another goal. */
export function rowSales({ goal, metrics }: DashboardGoalRow) {
  return goal === "ecommerce"
    ? {
        ...metrics,
        roas: goalRoas(metrics),
        costPerPurchase: costPerPurchase(metrics),
      }
    : null;
}

/** Whether a sales row reports purchases without their value. */
export function unvaluedSales(summary: DashboardGoalSummary): boolean {
  return summary.rows.some(
    (row) => row.goal === "ecommerce" && purchaseValueUnreported(row.metrics),
  );
}

/** A lead row's leads and cost per lead; null for a row of another goal. */
export function rowLeads({ goal, metrics }: DashboardGoalRow) {
  return goal === "leads"
    ? { leads: metrics.leads, cpl: goalCpl(metrics) }
    : null;
}

/**
 * The formatters of one platform's row, in its account's currency; the page's
 * own when every platform shares one currency.
 */
export function rowFormat(
  row: DashboardGoalRow,
  format: GoogleAdsFormatters,
  currencies: DashboardCurrencies,
): GoogleAdsFormatters {
  if (!currencies.mixed) {
    return format;
  }
  return {
    ...format,
    ...moneyFormatters(goalRowCurrency(row.platform, currencies)),
  };
}

/**
 * A total's sales figures and their split by currency (goalSalesMoney): the
 * store's sales over spend in several currencies have no cost per purchase or
 * ROAS to show.
 */
export function totalSales(
  summary: DashboardGoalSummary,
  sales: DashboardCombinedSales,
  revenueSource: DashboardRevenueSource | null,
  currencies: DashboardCurrencies,
) {
  const money = goalSalesMoney(summary, revenueSource !== null, currencies);
  const figures = { ...sales, addToCartTracked: sales.addToCart > 0 };
  return {
    figures: money.unmeasurable
      ? { ...figures, roas: null, costPerPurchase: null }
      : figures,
    split: money.split,
  };
}

/** The lead rows per currency, for a total's cost per lead. */
export function leadSplit(
  rows: Array<DashboardGoalRow>,
  currencies: DashboardCurrencies,
) {
  return goalMoneyParts(
    rows.filter((row) => row.goal === "leads"),
    currencies,
  );
}
