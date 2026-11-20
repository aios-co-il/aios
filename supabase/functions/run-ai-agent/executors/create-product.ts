import type { CreateProductArgs } from "./business-record-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing create_product executor and side-effect order. */
export async function executeCreateProduct(
  args: CreateProductArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const { data, error } = await supabase
    .from("products")
    .insert({
      name: args.name,
      description: args.description || null,
      price: args.price,
      active: true,
      tenant_id: tenantId,
    })
    .select("id, name, price")
    .single();
  if (error) {
    throw error;
  }
  return { product_id: data.id, name: data.name, price: data.price };
}
