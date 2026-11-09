import type { ListAgentsArgs } from "./admin-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing list_agents executor and side-effect order. */
export async function executeListAgents(
  args: ListAgentsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  let q = supabase
    .from("ai_agents")
    .select("id, name, talent, engine, active")
    .in("tenant_id", accessibleTenantIds);
  if (args.only_active) {
    q = q.eq("active", true);
  }
  const { data, error } = await q.order("name");
  if (error) {
    throw error;
  }
  return { count: data?.length || 0, agents: data };
}
