import type { ToolExecutionContext } from "../tool-context.ts";
import { addGoalMilestone } from "../../_shared/goal-execution.ts";

type AddGoalMilestoneArgs = {
  goal_id: string;
  title: string;
  description?: string;
  due_date?: string;
};

/** Preserves the existing add_goal_milestone executor and side-effect order. */
export async function executeAddGoalMilestone(
  args: AddGoalMilestoneArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, actorUserId } = context;

  const milestone = await addGoalMilestone(supabase, {
    tenantId,
    goalId: String(args.goal_id),
    title: String(args.title),
    description: args.description,
    dueDate: args.due_date,
    actorUserId,
  });
  return { milestone };
}
