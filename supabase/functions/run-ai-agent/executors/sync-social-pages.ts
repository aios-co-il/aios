import { invokeExecutorFunction } from "./invoke-executor-function.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

type SyncSocialPagesArgs = { client_id?: string };

/** Preserves the existing sync_social_pages executor and side-effect order. */
export async function executeSyncSocialPages(
  args: SyncSocialPagesArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const result = await invokeExecutorFunction(supabase, "social-pages-sync", {
    tenant_id: accessibleTenantIds[0],
    client_id: args.client_id,
  });
  return result.data;
}
