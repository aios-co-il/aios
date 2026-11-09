import type { GetSubagentResultArgs } from "./delegation-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { getSubagentResult } from "../../_shared/subagent.ts";

/** Preserves the existing get_subagent_result executor and side-effect order. */
export async function executeGetSubagentResult(
  args: GetSubagentResultArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  if (!args.sub_task_id) {
    throw new Error("sub_task_id is required");
  }
  return await getSubagentResult(supabase, tenantId, args.sub_task_id);
}
