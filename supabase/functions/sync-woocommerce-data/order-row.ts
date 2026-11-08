import { z } from "npm:zod@3.25.76";
import type { TablesInsert } from "../_shared/database.types.ts";
import { providerValue, address, text, amount } from "./provider-fields.ts";
const orderSchema = z.object({
  id: z.number().int().positive(),
  number: text,
  status: text,
  currency: text,
  total: amount,
  subtotal: amount,
  total_tax: amount,
  shipping_total: amount,
  discount_total: amount,
  customer_id: z.number().nullish(),
  billing: address,
  shipping: address,
  line_items: z.array(providerValue).optional().default([]),
  payment_method: text,
  payment_method_title: text,
  date_created: text,
  date_modified: text,
  date_completed: text,
  date_paid: text,
  meta_data: z
    .array(
      z.object({
        key: z.string().optional().catch(undefined),
        value: providerValue.optional(),
      }),
    )
    .optional(),
});
import { extractWooOrderAttribution } from "../_shared/wooAttribution.ts";
import { getPath, getString } from "../_shared/provider-json.ts";

export const toFloat = (value: unknown) => parseFloat(String(value));

function readOrderMetaData(
  order: unknown,
): Array<{ key?: string; value?: unknown }> | undefined {
  const raw = getPath(order, "meta_data");
  if (!Array.isArray(raw)) return undefined;
  return raw.map((m) => ({
    key: getString(m, "key"),
    value: getPath(m, "value"),
  }));
}

/** A woocommerce_orders row for one order from the WooCommerce REST API. */
export function mapOrderRow(tenant_id: string, siteId: string, value: unknown) {
  const order = orderSchema.parse(value);
  const billing = order.billing;
  return {
    tenant_id,
    site_id: siteId,
    woo_order_id: order.id,
    order_number: String(order.number || order.id),
    status: order.status,
    currency: order.currency,
    total: toFloat(order.total) || 0,
    subtotal: toFloat(order.subtotal) || 0,
    total_tax: toFloat(order.total_tax) || 0,
    shipping_total: toFloat(order.shipping_total) || 0,
    discount_total: toFloat(order.discount_total) || 0,
    customer_id: order.customer_id || null,
    customer_email: getString(billing, "email") || null,
    customer_first_name: getString(billing, "first_name") || null,
    customer_last_name: getString(billing, "last_name") || null,
    customer_phone: getString(billing, "phone") || null,
    billing: billing || {},
    shipping: order.shipping || {},
    line_items: order.line_items || [],
    payment_method: order.payment_method || null,
    payment_method_title: order.payment_method_title || null,
    date_created: order.date_created || null,
    date_modified: order.date_modified || null,
    date_completed: order.date_completed || null,
    date_paid: order.date_paid || null,
    attribution: (() => {
      const value = extractWooOrderAttribution(readOrderMetaData(order));
      return value ? { ...value } : null;
    })(),
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } satisfies TablesInsert<"woocommerce_orders">;
}
