import type { WooOrderAttribution } from "@/lib/wooAttribution";

/** The WooCommerce tab's headline figures, as both dashboard pages compute them. */
export type WooReportSummary = {
  totalRevenue: number;
  orderCount: number;
  cancelledCount: number;
  aov: number;
  uniqueCustomers: number;
  totalOrders: number;
};

/** Revenue and orders of one day. */
export type WooReportDay = { date: string; revenue: number; orders: number };

/** A product's sold quantity and revenue in the period. */
export type WooReportProduct = {
  name: string;
  quantity: number;
  revenue: number;
};

/** A WooCommerce order row as the tab reads it. */
export type WooReportOrder = {
  id: string;
  order_number?: string | number | null;
  date_created: string;
  status: string;
  total: number | string | null;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  customer_email?: string | null;
  attribution?: WooOrderAttribution | null;
};

/** The formatters of the tab. */
export type WooReportFormatters = {
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
};
