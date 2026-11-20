import type { PublishSocialPostArgs } from "./social-publishing-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessEntityClient } from "../../_shared/auth-helpers.ts";

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
  const targetTenantId = accessibleTenantIds[0];
  const r = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/social-publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        tenant_id: targetTenantId,
        page_id: args.page_id,
        post_type: args.post_type,
        caption: args.caption,
        media_url: args.media_url,
        link: args.link,
      }),
    },
  );
  return await r.json();
}
