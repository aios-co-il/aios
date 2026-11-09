import type { CreateAgentArgs } from "./admin-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing create_agent executor and side-effect order. */
export async function executeCreateAgent(
  args: CreateAgentArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const { data, error } = await supabase
    .from("ai_agents")
    .insert({
      tenant_id: tenantId,
      name: args.name,
      talent: args.talent,
      personality: args.personality || null,
      soul: args.soul || null,
      engine: args.engine || "gemini-3-flash",
      active: true,
    })
    .select("id, name")
    .single();
  if (error) {
    throw error;
  }
  return {
    agent_id: data.id,
    name: data.name,
    message: `סוכן ${data.name} נוצר בהצלחה תחת כרמן`,
  };
}
