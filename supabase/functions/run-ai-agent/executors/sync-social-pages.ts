import type { SyncSocialPagesArgs } from "./social-publishing-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing sync_social_pages executor and side-effect order. */
export async function executeSyncSocialPages(
  args: SyncSocialPagesArgs,
  context: ToolExecutionContext,
) {
  const { accessibleTenantIds } = context;

  const targetTenantId = accessibleTenantIds[0];
  const r = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/social-pages-sync`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        tenant_id: targetTenantId,
        client_id: args.client_id,
      }),
    },
  );
  return await r.json();
}
