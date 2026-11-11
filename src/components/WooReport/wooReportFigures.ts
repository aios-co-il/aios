import {
  sumWooRevenue,
  wooOrderRevenueTimestamp,
  type WooOrderRevenueRow,
} from "@/lib/wooOrderRevenue";
import type {
  WooReportDay,
  WooReportProduct,
  WooReportSummary,
} from "./wooReportTypes";

/** An order with the fields the tab's figures read. */
export type WooFigureOrder = WooOrderRevenueRow & {
  customer_email?: string | null;
  line_items?: unknown;
};

type WooLineItem = { name?: string; quantity?: unknown; total?: unknown };

const LOST_STATUSES = ["cancelled", "refunded", "failed"];

/**
 * The headline figures: revenue, orders, average order and unique customers
 * from the orders that count as revenue; cancellations and the order count
 * over every order of the period.
 */
export function wooReportSummary(
  revenueOrders: Array<WooFigureOrder>,
  allOrders: Array<WooFigureOrder>,
): WooReportSummary {
  const totalRevenue = sumWooRevenue(revenueOrders);
  const orderCount = revenueOrders.length;
  return {
    totalRevenue,
    orderCount,
    cancelledCount: allOrders.filter((order) =>
      LOST_STATUSES.includes(order.status ?? ""),
    ).length,
    aov: orderCount > 0 ? totalRevenue / orderCount : 0,
    uniqueCustomers: new Set(
      revenueOrders.map((order) => order.customer_email).filter(Boolean),
    ).size,
    totalOrders: allOrders.length,
  };
}

/** Revenue and orders per day of the revenue date, oldest first. */
export function wooReportDays(
  revenueOrders: Array<WooFigureOrder>,
): Array<WooReportDay> {
  const byDate = new Map<string, WooReportDay>();
  for (const order of revenueOrders) {
    const timestamp = wooOrderRevenueTimestamp(order);
    if (!timestamp) {
      continue;
    }
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const day = byDate.get(date) ?? { date, revenue: 0, orders: 0 };
    day.revenue += Number(order.total || 0);
    day.orders += 1;
    byDate.set(date, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** The ten products with the most revenue across the orders' line items. */
export function wooTopProducts(
  orders: Array<WooFigureOrder>,
): Array<WooReportProduct> {
  const byName = new Map<string, WooReportProduct>();
  for (const order of orders) {
    const items: Array<WooLineItem> = Array.isArray(order.line_items)
      ? order.line_items
      : [];
    for (const item of items) {
      const name = item.name || "מוצר ללא שם";
      const product = byName.get(name) ?? { name, quantity: 0, revenue: 0 };
      product.quantity += Number(item.quantity || 0);
      product.revenue += Number(item.total || 0);
      byName.set(name, product);
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
}
