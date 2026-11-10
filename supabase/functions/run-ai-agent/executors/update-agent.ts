import type { UpdateAgentArgs } from "./admin-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { TablesUpdate } from "../../_shared/database.types.ts";

/** Preserves the existing update_agent executor and side-effect order. */
export async function executeUpdateAgent(
  args: UpdateAgentArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const updates: Record<string, string | boolean> = {};
  for (const k of [
    "name",
    "talent",
    "personality",
    "soul",
    "engine",
    "active",
  ] as const) {
    if (args[k] !== undefined) {
      updates[k] = args[k];
    }
  }
  const { data, error } = await supabase
    .from("ai_agents")
    .update(updates as TablesUpdate<"ai_agents">)
    .eq("id", args.agent_id)
    .in("tenant_id", accessibleTenantIds)
    .select("id, name, active")
    .single();
  if (error) {
    throw error;
  }
  return data;
}
