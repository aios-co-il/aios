import { purchaseValueUnreported } from "@/lib/dashboardCombinedFigures";
import type { ReportFigures } from "./reportFigures";

/** The source line of figures the ad platforms report. */
export const PLATFORMS_SOURCE = "לפי דיווח הפלטפורמות";

/**
 * The sales a scope is measured on, as combinedDashboardSales sets them: the
 * store's purchases and revenue over the spend set against it, else the
 * campaigns' own.
 */
export function salesOf(f: ReportFigures): {
  purchases: number;
  revenue: number;
  spend: number;
} {
  if (f.store) {
    return {
      purchases: f.store.purchases || f.purchases,
      revenue: f.store.revenue,
      spend: f.store.spend,
    };
  }
  return { purchases: f.purchases, revenue: f.revenue, spend: f.spend };
}

/** Revenue over spend; null without spend or when the purchases carry no value. */
export function roasOf(f: ReportFigures): number | null {
  const sales = salesOf(f);
  if (sales.spend <= 0 || purchaseValueUnreported(sales)) {
    return null;
  }
  return sales.revenue / sales.spend;
}

/** Where a scope's sales come from. */
export function salesSource(f: ReportFigures): string {
  return f.store ? f.store.source : PLATFORMS_SOURCE;
}

/** Whether WooCommerce is the scope's store. */
export function isWoo(f: ReportFigures): boolean {
  return f.store?.source === "WooCommerce";
}

/** Analytics' add-to-cart, 0 without Analytics. */
export function analyticsCarts(f: ReportFigures): number {
  return f.analytics?.addToCart ?? 0;
}
