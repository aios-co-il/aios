import { invokeExecutorFunction } from "./invoke-executor-function.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessEntityClient } from "../../_shared/auth-helpers.ts";

type PublishSocialPostArgs = {
  page_id: string;
  post_type: "post" | "photo" | "video" | "reel" | "story" | "link";
  caption?: string;
  media_url?: string;
  link?: string;
  confirmed: boolean;
};

/** Preserves the existing publish_social_post executor and side-effect order. */
export async function executePublishSocialPost(
  args: PublishSocialPostArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds, callerScope } = context;

  await assertCallerCanAccessEntityClient(
    supabase,
    "social_pages",
    args.page_id,
    callerScope,
  );
  if (args.confirmed !== true) {
    return {
      error: "not_confirmed",
      message: "אישור משתמש מפורש נדרש (confirmed=true)",
    };
  }
  const result = await invokeExecutorFunction(supabase, "social-publish", {
    tenant_id: accessibleTenantIds[0],
    page_id: args.page_id,
    post_type: args.post_type,
    caption: args.caption,
    media_url: args.media_url,
    link: args.link,
  });
  return result.data;
}
