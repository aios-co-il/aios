// Reads a group's reply level for the Carmen handler and the client send
// guard (AIO-349). A failed read fails closed: Carmen stays silent there.
import type { DbClient } from "../supabase-clients.ts";
import { type GroupReplyLevel, groupReplyLevel } from "./group-reply-level.ts";

/** The reply level of the tenant's group row; automations_only when unreadable. */
export async function loadGroupReplyLevel(
  db: Pick<DbClient, "from">,
  input: { tenantId: string; groupId: string },
): Promise<GroupReplyLevel> {
  const { data, error } = await db
    .from("carmen_client_group_access")
    .select("allow_assigned_campaigners, allow_client_contacts")
    .eq("tenant_id", input.tenantId)
    .eq("whatsapp_group_id", input.groupId);
  if (error) {
    console.error("[carmen] group reply level unreadable; staying silent", {
      tenantId: input.tenantId,
      groupId: input.groupId,
      error,
    });
    return "automations_only";
  }
  return groupReplyLevel(data ?? []);
}
