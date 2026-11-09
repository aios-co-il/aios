import type { ListWaGroupsArgs } from "./messaging-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing list_wa_groups executor and side-effect order. */
export async function executeListWaGroups(
  args: ListWaGroupsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  let q = supabase
    .from("whatsapp_groups")
    .select("id, group_name, group_chat_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("is_blocked", false)
    .order("group_name", { ascending: true })
    .limit(args.limit || 50);
  if (args.name_search) {
    q = q.ilike("group_name", `%${args.name_search}%`);
  }
  const { data, error } = await q;
  if (error) {
    throw error;
  }
  return { count: data.length, groups: data };
}
