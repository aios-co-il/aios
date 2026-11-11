import type { GetAutonomousGoalStatusArgs } from "./goal-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { getGoalExecutionReport } from "../../_shared/goal-execution.ts";

/** Preserves the existing get_autonomous_goal_status executor and side-effect order. */
export async function executeGetAutonomousGoalStatus(
  args: GetAutonomousGoalStatusArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const report = await getGoalExecutionReport(
    supabase,
    tenantId,
    String(args.goal_id),
  );
  if (!report?.goal) {
    throw new Error("goal not found");
  }
  return { report };
}
