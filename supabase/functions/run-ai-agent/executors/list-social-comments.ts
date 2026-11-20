import type { ListSocialCommentsArgs } from "./social-publishing-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing list_social_comments executor and side-effect order. */
export async function executeListSocialComments(
  args: ListSocialCommentsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  let q = supabase
    .from("social_comments")
    .select(
      "id, platform, author_name, message, external_post_id, replied_at, hidden_at, created_at_external, page_id, client_id",
    )
    .in("tenant_id", accessibleTenantIds)
    .eq("is_from_page", false)
    .order("created_at_external", { ascending: false, nullsFirst: false })
    .limit(100);
  if (args.page_id) {
    q = q.eq("page_id", args.page_id);
  }
  if (args.client_id) {
    q = q.eq("client_id", args.client_id);
  }
  if (args.only_unreplied !== false) {
    q = q.is("replied_at", null).is("hidden_at", null);
  }
  const { data, error } = await q;
  if (error) {
    return { error: error.message };
  }
  return { count: data?.length || 0, comments: data || [] };
}
