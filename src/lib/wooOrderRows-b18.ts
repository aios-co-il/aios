import type { Json } from "@/integrations/supabase/types";
import type { WooOrderAttribution } from "@/lib/wooAttribution";
import { isJsonObject } from "@/types/dashboard-b18";

/** A `woocommerce_orders` row as selected by the Woo dashboards (any column subset). */
export type WooOrderRow = {
  id?: string;
  total: number | string | null;
  status: string | null;
  date_created: string | null;
  date_completed: string | null;
  date_paid: string | null;
  attribution: WooOrderAttribution | null;
  customer_email: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  order_number: string | null;
  currency: string | null;
  line_items: Json;
};

const stringOrNull = (value: Json | undefined): string | null =>
  typeof value === "string" ? value : null;

/** `woocommerce_orders.attribution` is jsonb written by the Woo sync. */
export function toWooOrderAttribution(
  value: Json | undefined,
): WooOrderAttribution | null {
  if (!isJsonObject(value)) return null;
  return {
    source_type: stringOrNull(value.source_type),
    utm_source: stringOrNull(value.utm_source),
    utm_medium: stringOrNull(value.utm_medium),
    utm_campaign: stringOrNull(value.utm_campaign),
    utm_content: stringOrNull(value.utm_content),
    utm_term: stringOrNull(value.utm_term),
    referrer: stringOrNull(value.referrer),
    session_entry: stringOrNull(value.session_entry),
    device_type: stringOrNull(value.device_type),
    label: typeof value.label === "string" ? value.label : "",
  };
}

/** Narrow one PostgREST row; columns that were not selected read as null. */
export function toWooOrderRow(value: unknown): WooOrderRow | null {
  if (!isJsonObject(value)) return null;
  const total = value.total;
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    total:
      typeof total === "number" || typeof total === "string" ? total : null,
    status: stringOrNull(value.status),
    date_created: stringOrNull(value.date_created),
    date_completed: stringOrNull(value.date_completed),
    date_paid: stringOrNull(value.date_paid),
    attribution: toWooOrderAttribution(value.attribution),
    customer_email: stringOrNull(value.customer_email),
    customer_first_name: stringOrNull(value.customer_first_name),
    customer_last_name: stringOrNull(value.customer_last_name),
    order_number: stringOrNull(value.order_number),
    currency: stringOrNull(value.currency),
    line_items: value.line_items ?? null,
  };
}

export function toWooOrderRows(rows: readonly unknown[] | null): WooOrderRow[] {
  return (rows ?? []).flatMap((row) => {
    const order = toWooOrderRow(row);
    return order ? [order] : [];
  });
}
