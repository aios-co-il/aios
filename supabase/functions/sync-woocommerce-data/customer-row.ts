import { z } from "npm:zod@3.25.76";
import type { TablesInsert } from "../_shared/database.types.ts";
import { address, text, amount } from "./provider-fields.ts";
import { toFloat } from "./order-row.ts";
const customerSchema = z.object({
  id: z.number().int().positive(),
  email: text,
  first_name: text,
  last_name: text,
  username: text,
  role: text,
  orders_count: z.number().optional(),
  total_spent: amount,
  avatar_url: text,
  billing: address,
  shipping: address,
});
/** Validate customer scalar fields and retain provider address JSON only at storage. */
export function mapCustomerRow(
  tenant_id: string,
  site_id: string,
  value: unknown,
): TablesInsert<"woocommerce_customers"> {
  const c = customerSchema.parse(value);
  return {
    tenant_id,
    site_id,
    woo_customer_id: c.id,
    email: c.email,
    first_name: c.first_name,
    last_name: c.last_name,
    username: c.username,
    role: c.role,
    orders_count: c.orders_count || 0,
    total_spent: toFloat(c.total_spent) || 0,
    avatar_url: c.avatar_url || null,
    billing: c.billing,
    shipping: c.shipping,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
