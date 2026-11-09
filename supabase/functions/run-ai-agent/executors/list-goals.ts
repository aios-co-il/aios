import type { ListGoalsArgs } from "./goal-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing list_goals executor and side-effect order. */
export async function executeListGoals(
  args: ListGoalsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  let query = supabase
    .from("goals")
    .select(
      "id, title, description, status, progress_percent, parent_goal_id, due_date, owner_type, owner_id, created_at",
    )
    .in("tenant_id", accessibleTenantIds)
    .order("created_at", { ascending: false })
    .limit(args.limit || 20);
  if (args.status) {
    query = query.eq("status", args.status);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return { count: data.length, goals: data };
}
