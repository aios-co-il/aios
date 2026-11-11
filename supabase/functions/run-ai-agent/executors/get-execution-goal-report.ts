import type { GetExecutionGoalReportArgs } from "./goal-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { getGoalExecutionReport } from "../../_shared/goal-execution.ts";

/** Preserves the existing get_execution_goal_report executor and side-effect order. */
export async function executeGetExecutionGoalReport(
  args: GetExecutionGoalReportArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const report = await getGoalExecutionReport(
    supabase,
    tenantId,
    String(args.goal_id),
    Number(args.since_hours) || 24,
  );
  return { report };
}
