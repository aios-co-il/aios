import type { ToolExecutionContext } from "../tool-context.ts";
import type { TablesUpdate } from "../../_shared/database.types.ts";

type UpdateAgentArgs = {
  agent_id: string;
  name?: string;
  talent?: string;
  personality?: string;
  soul?: string;
  engine?: string;
  active?: boolean;
};

/** Preserves the existing update_agent executor and side-effect order. */
export async function executeUpdateAgent(
  args: UpdateAgentArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const updates: TablesUpdate<"ai_agents"> = {
    ...(args.active !== undefined ? { active: args.active } : {}),
  };
  for (const k of [
    "name",
    "talent",
    "personality",
    "soul",
    "engine",
  ] as const) {
    if (args[k] !== undefined) {
      updates[k] = args[k];
    }
  }
  const { data, error } = await supabase
    .from("ai_agents")
    .update(updates)
    .eq("id", args.agent_id)
    .in("tenant_id", accessibleTenantIds)
    .select("id, name, active")
    .single();
  if (error) {
    throw error;
  }
  return data;
}
