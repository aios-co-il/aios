import type { ToolExecutionContext } from "../tool-context.ts";

type ListSuppliersArgs = { limit?: number };

/** Preserves the existing list_suppliers executor and side-effect order. */
export async function executeListSuppliers(
  args: ListSuppliersArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, type, phone, email")
    .in("tenant_id", accessibleTenantIds)
    .order("name")
    .limit(args.limit || 50);
  if (error) {
    throw error;
  }
  return { count: data.length, suppliers: data };
}
