import type { LinkTaskToExecutionGoalArgs } from "./goal-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { linkTaskToGoal } from "../../_shared/goal-execution.ts";

/** Preserves the existing link_task_to_execution_goal executor and side-effect order. */
export async function executeLinkTaskToExecutionGoal(
  args: LinkTaskToExecutionGoalArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, actorUserId } = context;

  const task = await linkTaskToGoal(supabase, {
    tenantId,
    goalId: String(args.goal_id),
    taskId: String(args.task_id),
    actorUserId,
  });
  return { task };
}
