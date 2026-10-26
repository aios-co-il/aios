/**
 * WhatsApp groups can exist under multiple tenants (same physical group,
 * same group_chat_id) when operators sync the same phone into MC and DMM.
 * Invite links fetched via one tenant's Green API should propagate to siblings.
 */
import { asRecords, optString, type QueryResult } from "./provider-json-b23.ts";

interface GroupsFilter extends PromiseLike<QueryResult> {
  match(filter: { group_chat_id: string }): GroupsFilter;
  filter(column: "invite_link", operator: "neq", value: string): GroupsFilter;
  not(column: "invite_link", operator: "is", value: null): GroupsFilter;
  limit(count: number): GroupsFilter;
}

interface GroupsDb {
  from(table: "whatsapp_groups"): {
    update(values: { invite_link: string }): GroupsFilter;
    select(columns: string): GroupsFilter;
  };
}

export async function propagateWhatsappGroupInviteLink(
  supabase: GroupsDb,
  groupChatId: string,
  inviteLink: string | null | undefined,
): Promise<void> {
  const link = typeof inviteLink === "string" ? inviteLink.trim() : "";
  if (!groupChatId || !link) return;

  const { error } = await supabase
    .from("whatsapp_groups")
    .update({ invite_link: link })
    .match({ group_chat_id: groupChatId })
    .filter("invite_link", "neq", link);

  if (error) {
    console.warn("[whatsapp-groups] invite_link propagation failed", {
      groupChatId,
      error: error.message,
    });
  }
}

/** Use cached link, or copy from a sibling row with the same group_chat_id. */
export async function resolveWhatsappGroupInviteLink(
  supabase: GroupsDb,
  groupChatId: string | null | undefined,
  cachedLink: string | null | undefined,
): Promise<string | null> {
  const link = typeof cachedLink === "string" ? cachedLink.trim() : "";
  if (link) return link;
  if (!groupChatId) return null;

  const { data: siblings } = await supabase
    .from("whatsapp_groups")
    .select("invite_link")
    .match({ group_chat_id: groupChatId })
    .not("invite_link", "is", null)
    .limit(1);

  const siblingLink =
    optString(asRecords(siblings)[0]?.invite_link)?.trim() || null;
  if (siblingLink) {
    await propagateWhatsappGroupInviteLink(supabase, groupChatId, siblingLink);
  }
  return siblingLink;
}
