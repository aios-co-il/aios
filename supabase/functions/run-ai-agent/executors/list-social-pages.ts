import type { ListSocialPagesArgs } from "./social-publishing-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing list_social_pages executor and side-effect order. */
export async function executeListSocialPages(
  args: ListSocialPagesArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  let q = supabase
    .from("social_pages")
    .select(
      "id, platform, page_id, page_name, client_id, ig_business_id, picture_url, is_active",
    )
    .in("tenant_id", accessibleTenantIds)
    .eq("is_active", true)
    .order("page_name");
  if (args.platform) {
    q = q.eq("platform", args.platform);
  }
  if (args.client_id) {
    q = q.eq("client_id", args.client_id);
  }
  const { data, error } = await q;
  if (error) {
    return { error: error.message };
  }
  return { count: data?.length || 0, pages: data || [] };
}
