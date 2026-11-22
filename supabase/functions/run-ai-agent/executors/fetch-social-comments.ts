import { invokeExecutorFunction } from "./invoke-executor-function.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

type FetchSocialCommentsArgs = { page_id: string };

/** Preserves the existing fetch_social_comments executor and side-effect order. */
export async function executeFetchSocialComments(
  args: FetchSocialCommentsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const targetTenantId = accessibleTenantIds[0];
  const result = await invokeExecutorFunction(supabase, "social-comments", {
    action: "fetch",
    tenant_id: targetTenantId,
    page_id: args.page_id,
  });
  return result.data;
}
