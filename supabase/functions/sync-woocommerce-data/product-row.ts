import { z } from "npm:zod@3.25.76";
import type { TablesInsert } from "../_shared/database.types.ts";
import { providerValue, text, amount } from "./provider-fields.ts";
import { toFloat } from "./order-row.ts";
const productSchema = z.object({
  id: z.number().int().positive(),
  name: text,
  slug: text,
  status: text,
  type: text,
  sku: text,
  price: amount,
  regular_price: amount,
  sale_price: amount,
  stock_quantity: z.number().nullish(),
  stock_status: text,
  total_sales: z.number().optional(),
  categories: z.array(providerValue).optional(),
  images: z.array(providerValue).optional(),
});
/** Validate product identifiers and scalar columns before persistence. */
export function mapProductRow(
  tenant_id: string,
  site_id: string,
  value: unknown,
): TablesInsert<"woocommerce_products"> {
  const p = productSchema.parse(value);
  return {
    tenant_id,
    site_id,
    woo_product_id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    type: p.type,
    sku: p.sku || null,
    price: toFloat(p.price) || null,
    regular_price: toFloat(p.regular_price) || null,
    sale_price: toFloat(p.sale_price) || null,
    stock_quantity: p.stock_quantity ?? null,
    stock_status: p.stock_status,
    total_sales: p.total_sales || 0,
    categories: p.categories || [],
    images: p.images || [],
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
