import type { ListClientMediaArgs } from "./media-record-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing list_client_media executor and side-effect order. */
export async function executeListClientMedia(
  args: ListClientMediaArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  let q = supabase
    .from("marketing_media_library")
    .select(
      "id, mime_type, file_size, ad_ready, caption, tags, created_at, client_id, lead_id",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(args.limit || 20);
  if (args.client_id) {
    q = q.eq("client_id", args.client_id);
  }
  if (args.lead_id) {
    q = q.eq("lead_id", args.lead_id);
  }
  if (args.only_ad_ready) {
    q = q.eq("ad_ready", true);
  }
  if (Array.isArray(args.tags) && args.tags.length) {
    q = q.contains("tags", args.tags);
  }
  const { data, error } = await q;
  if (error) {
    throw error;
  }
  return { count: data.length, media: data };
}
