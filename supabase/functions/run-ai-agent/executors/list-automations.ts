import type { ListAutomationsArgs } from "./automation-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing list_automations executor and side-effect order. */
export async function executeListAutomations(
  args: ListAutomationsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  let q = supabase
    .from("automations")
    .select("id, name, description, active, trigger_type, is_flow, updated_at")
    .in("tenant_id", accessibleTenantIds)
    .order("name")
    .limit(args.limit || 50);
  if (args.active_only === true) {
    q = q.eq("active", true);
  }
  if (args.name_search) {
    q = q.ilike("name", `%${args.name_search}%`);
  }
  const { data, error } = await q;
  if (error) {
    throw error;
  }
  return { count: data.length, automations: data };
}
