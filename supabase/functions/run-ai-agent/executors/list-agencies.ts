import type { ListAgenciesArgs } from "./business-record-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing list_agencies executor and side-effect order. */
export async function executeListAgencies(
  args: ListAgenciesArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const { data, error } = await supabase
    .from("agencies")
    .select("id, name, contact_name, phone, email")
    .in("tenant_id", accessibleTenantIds)
    .order("name")
    .limit(args.limit || 50);
  if (error) {
    throw error;
  }
  return { count: data.length, agencies: data };
}
