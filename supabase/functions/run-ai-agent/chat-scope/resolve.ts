/**
 * Who may read which WhatsApp rows through Carmen's chat tools
 * (get_chat_history, search_conversation_history, get_recent_inbound_messages).
 * AIO-231.
 *
 * run-ai-agent reads chat_messages with the service role, so RLS does not
 * limit these tools. The scope is built here only from the verified caller
 * (the JWT user, or the WhatsApp sender's staff record) and the WhatsApp chat
 * the turn came from. Tool arguments from the model are applied on top and
 * can only narrow it.
 *
 * The caller's role is read from user_roles of this tenant (plus global,
 * tenant_id null, roles), never from run-ai-agent's callerRole: that one is
 * picked across all of the user's tenants, so an owner of another tenant
 * would get owner access here.
 *
 * In every scope except owner/super_admin, a green_api row is visible only
 * when its connection is one the caller may read in the Chat page
 * (chat_allowed_connection_user_ids, the get_chat_contacts rule). Unlinked
 * threads, such as David's private DMs on his Green API line, never match.
 */
import type { DbClient } from "../../_shared/supabase-clients.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";
import { phoneTail, uuids } from "./ids.ts";
import { CHAT_SCOPE_NOTES } from "./responses.ts";
import { chatRoleTier, tenantRoleFor } from "./roles.ts";
import { staffScopeFor } from "./staff-scope.ts";
import type { ChatScope, ChatScopeInput, ChatScopeMode } from "./types.ts";

/**
 * Builds the caller's chat scope. owner / super_admin: every chat of the
 * tenant. A WhatsApp group turn by anyone else: that group only. Other staff:
 * the client- and lead-linked threads they are responsible for, plus their own
 * private chat with Carmen. Everyone else: nothing.
 */
export async function resolveChatScope(
  supabase: Pick<DbClient, "from" | "rpc">,
  input: ChatScopeInput,
): Promise<ChatScope> {
  const userId = asUuidOrNull(input.userId);
  const role = userId
    ? await tenantRoleFor(supabase, input.tenantId, userId)
    : null;
  const tier = chatRoleTier(role, input.callerCampaignerId);
  if (tier === "full") {
    return FULL_CHAT_SCOPE;
  }

  const tenantIds = uuids(
    input.accessibleTenantIds?.length
      ? input.accessibleTenantIds
      : [input.tenantId],
  );

  if (isGroupTurn(input.waNotify)) {
    const chatId = String(input.waNotify?.chat_id || "");
    const groupId = await groupIdFor(supabase, input.tenantId, chatId);
    if (!groupId) {
      return noneScope(CHAT_SCOPE_NOTES.groupNotFound);
    }

    return {
      ...emptyScope("group"),
      groupId,
      connectionUserIds:
        tier && userId
          ? await allowedConnectionUserIds(supabase, input.tenantId, userId)
          : [],
    };
  }

  if (!tier) {
    return noneScope(CHAT_SCOPE_NOTES.notStaff);
  }

  const connectionUserIds = userId
    ? await allowedConnectionUserIds(supabase, input.tenantId, userId)
    : [];
  const staff = await staffScopeFor(supabase, {
    tier,
    role,
    userId,
    callerCampaignerId: input.callerCampaignerId,
    today: input.today,
    tenantIds,
  });
  return {
    ...emptyScope("staff"),
    ...staff,
    connectionUserIds,
    ownThread: ownThreadFor(input.waNotify),
  };
}

/** owner / super_admin: every chat of the tenant, unfiltered. */
export const FULL_CHAT_SCOPE: Readonly<ChatScope> = Object.freeze(
  emptyScope("full"),
);

/** Whether this turn came from a WhatsApp group chat. */
export function isGroupTurn(waNotify: ChatScopeInput["waNotify"]): boolean {
  if (!waNotify) {
    return false;
  }

  const chatId = String(waNotify.chat_id || "");
  return /@g\.us$/i.test(chatId) || waNotify.is_group === true;
}

/**
 * The get_chat_contacts connection rule, from the database. Fails closed: on
 * error the caller sees no green_api rows.
 */
export async function allowedConnectionUserIds(
  supabase: Pick<DbClient, "rpc">,
  tenantId: string,
  userId: string,
): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc(
      "chat_allowed_connection_user_ids",
      { p_tenant_id: tenantId, p_user_id: userId },
    );
    if (error) {
      throw error;
    }

    return uuids(Array.isArray(data) ? data : []);
  } catch (e) {
    console.warn(
      "[chat-scope] chat_allowed_connection_user_ids failed; hiding green_api rows:",
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}

/** A scope of `mode` that matches nothing until its fields are filled in. */
function emptyScope(mode: ChatScopeMode): ChatScope {
  return {
    mode,
    reason: null,
    groupId: null,
    connectionUserIds: [],
    clientIds: [],
    leads: { all: false, agencyIds: [], salesPersonId: null },
    linkedGroupIds: [],
    ownThread: null,
  };
}

/** A scope that reads nothing, with the note Carmen relays. */
function noneScope(reason: string): ChatScope {
  return { ...emptyScope("none"), reason };
}

/** The whatsapp_groups id of this group chat; throws on a DB error. */
async function groupIdFor(
  supabase: Pick<DbClient, "from">,
  tenantId: string,
  chatId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("whatsapp_groups")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("group_chat_id", chatId)
    .maybeSingle();
  if (error) {
    throw error;
  }

  return asUuidOrNull(data?.id);
}

/** On a private WhatsApp turn, the caller's own chat with Carmen. */
function ownThreadFor(
  waNotify: ChatScopeInput["waNotify"],
): ChatScope["ownThread"] {
  const tail = waNotify ? phoneTail(waNotify.chat_id) : "";
  return tail
    ? {
        phoneTail: tail,
        connectionUserId: asUuidOrNull(waNotify?.connection_user_id),
      }
    : null;
}
