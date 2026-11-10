import type { ListProductsArgs } from "./business-record-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing list_products executor and side-effect order. */
export async function executeListProducts(
  args: ListProductsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const { data, error } = await supabase
    .from("products")
    .select("id, name, description, price, active")
    .in("tenant_id", accessibleTenantIds)
    .order("name")
    .limit(args.limit || 50);
  if (error) {
    throw error;
  }
  return { count: data.length, products: data };
}
