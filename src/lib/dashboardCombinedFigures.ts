import type {
  DashboardGoalMetrics,
  DashboardGoalSummary,
} from "@/lib/dashboardGoalSummary";

/** The store's figures (WooCommerce, else Analytics) when the dashboard has a store. */
export type DashboardStoreSales = {
  purchases: number;
  revenue: number;
  addToCart: number;
};

/**
 * The dashboard's combined sales. Without a store, what its sales campaigns
 * report, over their own spend. With one, the store's purchases and revenue
 * over every campaign's spend but the lead campaigns': the store sells
 * through sales and traffic campaigns, and lead campaigns are measured on
 * cost per lead.
 */
export function combinedDashboardSales(
  summary: DashboardGoalSummary,
  store: DashboardStoreSales | null,
): DashboardStoreSales & { roas: number } {
  const sales = summary.goals.ecommerce;
  if (!store) {
    return { ...pickSales(sales), roas: goalRoas(sales) };
  }
  const storeSpend = summary.total.spend - summary.goals.leads.spend;
  return {
    purchases: store.purchases || sales.purchases,
    revenue: store.revenue,
    addToCart: store.addToCart,
    roas: goalRoas({ spend: storeSpend, revenue: store.revenue }),
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
 * The dashboard's KPI mode: sales when it has a sales campaign or its store
 * (Analytics) sells, leads when its campaigns are all lead or traffic
 * campaigns, and the tables' mode when no campaign has data in the range.
 */
export function dashboardCampaignMode(
  summary: DashboardGoalSummary,
  tables: { mode: "ecommerce" | "leads"; storeSells: boolean },
): "ecommerce" | "leads" {
  if (summary.hasEcommerce || tables.storeSells) {
    return "ecommerce";
  }
  return summary.rows.length > 0 ? "leads" : tables.mode;
}

/** Revenue over spend. */
export function goalRoas(metrics: { spend: number; revenue: number }): number {
  return metrics.spend > 0 ? metrics.revenue / metrics.spend : 0;
}

/** Spend over leads. */
export function goalCpl(metrics: { spend: number; leads: number }): number {
  return metrics.leads > 0 ? metrics.spend / metrics.leads : 0;
}

/** The sales figures of a goal's totals. */
function pickSales(metrics: DashboardGoalMetrics): DashboardStoreSales {
  const { purchases, revenue, addToCart } = metrics;
  return { purchases, revenue, addToCart };
}
