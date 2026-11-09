import type { ListBroadcastsArgs } from "./broadcast-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing list_broadcasts executor and side-effect order. */
export async function executeListBroadcasts(
  args: ListBroadcastsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  let q = supabase
    .from("broadcasts")
    .select(
      "id, name, channel, status, scheduled_at, stats, created_at, body_text",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(args.limit || 20);
  if (args.status) {
    q = q.eq("status", args.status);
  }
  const { data, error } = await q;
  if (error) {
    throw error;
  }
  return { count: data.length, broadcasts: data };
}
