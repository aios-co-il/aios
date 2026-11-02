import {
  getAddToCartFromData,
  getPurchasesFromData,
  getRevenueFromData,
} from "@/lib/adsMetrics";
import type {
  DashboardGoalMetrics,
  DashboardGoalSummary,
} from "@/lib/dashboardGoalSummary";

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

/** Combined sales; ROAS is null when no spend can be set against the revenue. */
export type DashboardCombinedSales = DashboardStoreSales & {
  roas: number | null;
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
    return {
      ...pickSales(sales),
      roas: roasOrNull(sales.revenue, sales.spend),
    };
  }
  const storeSpend = summary.total.spend - summary.goals.leads.spend;
  return {
    purchases: store.purchases || sales.purchases,
    revenue: store.revenue,
    addToCart: store.addToCart,
    roas: roasOrNull(store.revenue, storeSpend),
  };
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
 * The dashboard's KPI mode: sales when it has a sales campaign or a store that
 * sold in the range, leads when its campaigns are lead or traffic campaigns,
 * and without either, sales only when a table is set up for sales.
 */
export function dashboardCampaignMode(
  summary: DashboardGoalSummary,
  store: DashboardStore | null,
  tables: Array<{
    integration_type?: string | null;
    integration_settings?: Record<string, unknown> | null;
  }>,
): "ecommerce" | "leads" {
  if (summary.hasEcommerce || store) {
    return "ecommerce";
  }
  if (summary.rows.length > 0) {
    return "leads";
  }
  const salesTable = tables.some(
    (table) =>
      table.integration_type === "facebook_ecommerce" ||
      table.integration_settings?.campaign_type === "ecommerce",
  );
  return salesTable ? "ecommerce" : "leads";
}

/** Revenue over spend. */
export function goalRoas(metrics: { spend: number; revenue: number }): number {
  return metrics.spend > 0 ? metrics.revenue / metrics.spend : 0;
}

/** Spend over leads. */
export function goalCpl(metrics: { spend: number; leads: number }): number {
  return metrics.leads > 0 ? metrics.spend / metrics.leads : 0;
}

/** Revenue over spend, or null without spend. */
function roasOrNull(revenue: number, spend: number): number | null {
  return spend > 0 ? revenue / spend : null;
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
