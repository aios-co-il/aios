import type { ToolExecutionContext } from "../tool-context.ts";
import { addGoalBlocker } from "../../_shared/goal-execution.ts";

type AddGoalBlockerArgs = {
  goal_id: string;
  title: string;
  description?: string;
};

/** Preserves the existing add_goal_blocker executor and side-effect order. */
export async function executeAddGoalBlocker(
  args: AddGoalBlockerArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, actorUserId } = context;

  const blocker = await addGoalBlocker(supabase, {
    tenantId,
    goalId: String(args.goal_id),
    title: String(args.title),
    description: args.description,
    actorUserId,
  });
  return { blocker };
}
