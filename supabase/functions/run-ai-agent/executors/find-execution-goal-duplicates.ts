import type { FindExecutionGoalDuplicatesArgs } from "./goal-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { findDuplicateGoals } from "../../_shared/goal-execution.ts";

/** Preserves the existing find_execution_goal_duplicates executor and side-effect order. */
export async function executeFindExecutionGoalDuplicates(
  args: FindExecutionGoalDuplicatesArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const title = String(args.title || "").trim();
  if (!title) {
    return { duplicates: [] };
  }
  const duplicates = await findDuplicateGoals(supabase, tenantId, title);
  return {
    duplicates: duplicates.map((d) => ({
      id: d.goal.id,
      title: d.goal.title,
      status: d.goal.status,
      score: d.score,
    })),
  };
}
