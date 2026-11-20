import type { ListSalesPeopleArgs } from "./business-record-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing list_sales_people executor and side-effect order. */
export async function executeListSalesPeople(
  args: ListSalesPeopleArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const { data, error } = await supabase
    .from("sales_people")
    .select("id, full_name, phone, email")
    .in("tenant_id", accessibleTenantIds)
    .order("full_name")
    .limit(args.limit || 50);
  if (error) {
    throw error;
  }
  return { count: data.length, sales_people: data };
}
