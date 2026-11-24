import { invokeExecutorFunction } from "./invoke-executor-function.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing sync_maskyoo_cdr executor and side-effect order. */
export async function executeSyncMaskyooCdr(
  args: SyncMaskyooCdrArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;
  const { data, ok, status } = await invokeExecutorFunction(
    supabase,
    "sync-maskyoo-cdr",
    {
      tenant_id: tenantId,
      from_date: args.from_date,
    },
  );
  if (!ok) {
    return { error: data.error || `סנכרון נכשל [${status}]` };
  }
  return { success: true, ...data };
}

type SyncMaskyooCdrArgs = { from_date?: string };
