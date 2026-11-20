import type { GetReconciliationStatusArgs } from "./ad-report-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { reconciliationStatusTool } from "../status-tool.ts";

/** Preserves the existing get_reconciliation_status executor and side-effect order. */
export async function executeGetReconciliationStatus(
  args: GetReconciliationStatusArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, actorUserId, callerScope } = context;
  return await reconciliationStatusTool(
    { supabase, callerScope, tenantId, actorUserId },
    args,
  );
}
