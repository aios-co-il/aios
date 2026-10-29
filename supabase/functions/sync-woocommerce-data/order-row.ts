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
export function mapOrderRow(tenant_id: string, siteId: string, order: unknown) {
  const field = (key: string) => getPath(order, key);
  const billing = field("billing");
  return {
    tenant_id,
    site_id: siteId,
    woo_order_id: field("id"),
    order_number: String(field("number") || field("id")),
    status: field("status"),
    currency: field("currency"),
    total: toFloat(field("total")) || 0,
    subtotal: toFloat(field("subtotal")) || 0,
    total_tax: toFloat(field("total_tax")) || 0,
    shipping_total: toFloat(field("shipping_total")) || 0,
    discount_total: toFloat(field("discount_total")) || 0,
    customer_id: field("customer_id") || null,
    customer_email: getPath(billing, "email") || null,
    customer_first_name: getPath(billing, "first_name") || null,
    customer_last_name: getPath(billing, "last_name") || null,
    customer_phone: getPath(billing, "phone") || null,
    billing: billing || {},
    shipping: field("shipping") || {},
    line_items: field("line_items") || [],
    payment_method: field("payment_method") || null,
    payment_method_title: field("payment_method_title") || null,
    date_created: field("date_created") || null,
    date_modified: field("date_modified") || null,
    date_completed: field("date_completed") || null,
    date_paid: field("date_paid") || null,
    attribution: extractWooOrderAttribution(readOrderMetaData(order)),
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
