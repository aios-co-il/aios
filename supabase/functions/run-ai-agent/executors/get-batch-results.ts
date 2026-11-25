import type { ToolExecutionContext } from "../tool-context.ts";
import { getBatchResults } from "../../_shared/subagent.ts";

type GetBatchResultsArgs = { batch_id: string };

export async function executeGetBatchResults(
  args: GetBatchResultsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  if (!args.batch_id) {
    throw new Error("batch_id is required");
  }
  return await getBatchResults(supabase, tenantId, args.batch_id);
}
