import type { FetchSocialCommentsArgs } from "./social-publishing-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing fetch_social_comments executor and side-effect order. */
export async function executeFetchSocialComments(
  args: FetchSocialCommentsArgs,
  context: ToolExecutionContext,
) {
  const { accessibleTenantIds } = context;

  const targetTenantId = accessibleTenantIds[0];
  const r = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/social-comments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        action: "fetch",
        tenant_id: targetTenantId,
        page_id: args.page_id,
      }),
    },
  );
  return await r.json();
}
