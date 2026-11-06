import {
  getAddToCartFromData,
  getPurchasesFromData,
  getRevenueFromData,
} from "@/lib/adsMetrics";
import type {
  DashboardGoalMetrics,
  DashboardGoalSummary,
} from "@/lib/dashboardGoalSummary";
import { isEcommerceReportTable } from "@/lib/pulseCampaignGoals";
import type { GoalReportTable } from "../../supabase/functions/_shared/campaign-goal/table-goal.ts";

/** The store's sales figures in the range. */
export type DashboardStoreSales = {
  purchases: number;
  revenue: number;
  addToCart: number;
};

export type DashboardRevenueSource = "WooCommerce" | "Analytics";

/** A store that sold in the range, and where its figures come from. */
export type DashboardStore = DashboardStoreSales & {
  source: DashboardRevenueSource;
};

/** A dashboard record as both dashboard pages tag it. */
export type DashboardSourceRecord = {
  _source?: string;
  data?: Record<string, unknown> | null;
};

/**
 * Combined sales. ROAS is null when no spend can be set against the revenue,
 * or when the purchases carry no value (purchaseValueUnreported); cost per
 * purchase is null without purchases.
 */
export type DashboardCombinedSales = DashboardStoreSales & {
  roas: number | null;
  costPerPurchase: number | null;
};

/**
 * The dashboard's store: WooCommerce when it has revenue or orders in the
 * range, else Analytics when its daily rows have revenue or purchases, else
 * none. Undated Analytics rows (traffic sources) never count, and add-to-cart
 * alone is no sale. The internal dashboard and its share link both decide it
 * here, so they show the same ROAS.
 */
export function dashboardStore(
  records: DashboardSourceRecord[],
  woo: { revenue: number; orders: number },
): DashboardStore | null {
  const analytics = analyticsSales(records);
  if (woo.revenue > 0 || woo.orders > 0) {
    return {
      source: "WooCommerce",
      purchases: woo.orders,
      revenue: woo.revenue,
      addToCart: analytics.addToCart,
    };
  }
  if (analytics.revenue > 0 || analytics.purchases > 0) {
    return { source: "Analytics", ...analytics };
  }
  return null;
}

/**
 * The dashboard's combined sales. Without a store, what its sales campaigns
 * report, over their own spend. With one, the store's purchases and revenue
 * over every campaign's spend but the lead campaigns': the store sells
 * through sales and traffic campaigns, and lead campaigns are measured on
 * cost per lead.
 */
export function combinedDashboardSales(
  summary: DashboardGoalSummary,
  store: DashboardStore | null,
): DashboardCombinedSales {
  const sales = summary.goals.ecommerce;
  if (!store) {
    return salesOverSpend(pickSales(sales), sales.spend);
  }
  return salesOverSpend(
    {
      purchases: store.purchases || sales.purchases,
      revenue: store.revenue,
      addToCart: store.addToCart,
    },
    nonLeadSpend(summary),
  );
}

/**
 * Purchases that carry no value, such as a free course a sales campaign
 * gives away: ROAS cannot measure them, so they are shown by cost per
 * purchase. A sales campaign that sold nothing is not one of them and keeps
 * its ROAS of 0.
 */
export function purchaseValueUnreported(figures: {
  purchases: number;
  revenue: number;
}): boolean {
  return figures.purchases > 0 && figures.revenue <= 0;
}

/**
 * The cost per purchase the dashboard's ROAS card shows in place of ROAS when
 * the purchases carry no value; null when ROAS applies.
 */
export function unvaluedPurchaseCost(
  sales: DashboardCombinedSales,
): number | null {
  return purchaseValueUnreported(sales) ? sales.costPerPurchase : null;
}

/** Spend over purchases, or null without purchases or spend. */
export function costPerPurchase(metrics: {
  spend: number;
  purchases: number;
}): number | null {
  return metrics.purchases > 0 && metrics.spend > 0
    ? metrics.spend / metrics.purchases
    : null;
}

/** The lead campaigns' leads and cost per lead: their spend over their leads. */
export function combinedDashboardLeads(summary: DashboardGoalSummary): {
  leads: number;
  cpl: number;
} {
  const leads = summary.goals.leads;
  return { leads: leads.leads, cpl: goalCpl(leads) };
}

/**
 * The dashboard's KPI mode: sales when it has a sales campaign, or a store
 * that sold with spend outside lead campaigns to measure it against; leads
 * when its campaigns are lead or traffic campaigns. Lead campaigns never show
 * ROAS, so a lead-only client stays in leads mode in every date range, store
 * or not. Without campaigns in the range, a table set up for sales decides.
 */
export function dashboardCampaignMode(
  summary: DashboardGoalSummary,
  store: DashboardStore | null,
  tables: Array<GoalReportTable>,
): "ecommerce" | "leads" {
  if (summary.hasEcommerce || (store && nonLeadSpend(summary) > 0)) {
    return "ecommerce";
  }
  if (summary.rows.length > 0) {
    return "leads";
  }
  return tables.some(isEcommerceReportTable) ? "ecommerce" : "leads";
}

/** Revenue over spend; null when the purchases carry no value. */
export function goalRoas(metrics: {
  spend: number;
  revenue: number;
  purchases: number;
}): number | null {
  if (purchaseValueUnreported(metrics)) {
    return null;
  }
  return metrics.spend > 0 ? metrics.revenue / metrics.spend : 0;
}

/** Spend over leads. */
export function goalCpl(metrics: { spend: number; leads: number }): number {
  return metrics.leads > 0 ? metrics.spend / metrics.leads : 0;
}

/** Spend on sales and traffic campaigns: what a store's revenue is set against. */
function nonLeadSpend(summary: DashboardGoalSummary): number {
  return summary.total.spend - summary.goals.leads.spend;
}

/** Sales with their ROAS and cost per purchase against this spend. */
function salesOverSpend(
  sales: DashboardStoreSales,
  spend: number,
): DashboardCombinedSales {
  const measurable = spend > 0 && !purchaseValueUnreported(sales);
  return {
    ...sales,
    roas: measurable ? sales.revenue / spend : null,
    costPerPurchase: costPerPurchase({ spend, purchases: sales.purchases }),
  };
}

/** Purchases, revenue and add-to-cart of Analytics' daily rows. */
function analyticsSales(records: DashboardSourceRecord[]): DashboardStoreSales {
  const sales = { purchases: 0, revenue: 0, addToCart: 0 };
  for (const record of records) {
    const data = record.data;
    if (
      record._source !== "google_analytics" ||
      data?.report_type !== "daily"
    ) {
      continue;
    }
    sales.purchases += getPurchasesFromData(data);
    sales.revenue += getRevenueFromData(data);
    sales.addToCart += getAddToCartFromData(data);
  }
  return sales;
}

/** The sales figures of a goal's totals. */
function pickSales(metrics: DashboardGoalMetrics): DashboardStoreSales {
  const { purchases, revenue, addToCart } = metrics;
  return { purchases, revenue, addToCart };
}
