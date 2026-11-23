import { invokeExecutorFunction } from "./invoke-executor-function.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessEntityClient } from "../../_shared/auth-helpers.ts";

type HideSocialCommentArgs = {
  comment_row_id: string;
  confirmed: boolean;
};

/** Preserves the existing hide_social_comment executor and side-effect order. */
export async function executeHideSocialComment(
  args: HideSocialCommentArgs & { message?: string },
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds, callerScope, name } = context;

  await assertCallerCanAccessEntityClient(
    supabase,
    "social_comments",
    args.comment_row_id,
    callerScope,
  );
  if (args.confirmed !== true) {
    return { error: "not_confirmed", message: "אישור משתמש מפורש נדרש" };
  }
  const targetTenantId = accessibleTenantIds[0];
  const action = name === "reply_to_social_comment" ? "reply" : "hide";
  const result = await invokeExecutorFunction(supabase, "social-comments", {
    action,
    tenant_id: targetTenantId,
    comment_row_id: args.comment_row_id,
    message: args.message,
  });
  return result.data;
}
