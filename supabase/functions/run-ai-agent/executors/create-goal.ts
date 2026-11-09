import type { CreateGoalArgs } from "./goal-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing create_goal executor and side-effect order. */
export async function executeCreateGoal(
  args: CreateGoalArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const { data, error } = await supabase
    .from("goals")
    .insert({
      tenant_id: tenantId,
      title: args.title,
      description: args.description || null,
      parent_goal_id: args.parent_goal_id || null,
      due_date: args.due_date || null,
      owner_type: args.owner_type || "agent",
      owner_id: args.owner_id || null,
      status: "active",
      progress_percent: 0,
    })
    .select("id, title, status")
    .single();
  if (error) {
    throw error;
  }
  return { goal_id: data.id, title: data.title, status: data.status };
}
