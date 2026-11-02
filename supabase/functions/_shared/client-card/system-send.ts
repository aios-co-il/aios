// WhatsApp sends that post to the provider directly and write no chat row of
// their own (trigger-automation's Green API / Manus steps, Carmen's
// webhook-fallback replies) are recorded here, so the client card trigger can
// log them. A row is written only while the tenant has card logging on, so a
// tenant that never turns it on sees no change. Nothing here throws: the
// message has already gone out.
//
// Green API echoes every API send back to green-api-webhook
// (outgoingAPIMessageReceived). Before this row existed the echo stored the
// message and mirrored it to linked team channels; the echo now finds this row
// and skips it, so a Green API row starts with raw_provider_data.team_forward
// "pending" and the echo claims that mirror once
// (green-api-webhook/stored-send-forward.ts). When the two writes cross, the
// merge_green_api_send_echo trigger keeps one row.
import { isGroupChatId } from "../carmen-session-identity.ts";
import type { DbClient } from "../supabase-clients.ts";
import { isRecord } from "./is-record.ts";

/** raw_provider_data.team_forward of a Green API row whose echo still owes the team-channel mirror. */
export const TEAM_FORWARD_PENDING = "pending";

export type AutomationProvider = "green_api" | "manus_wa";

export type AutomationClientSend = {
  tenantId: string;
  chatId: string;
  message: string;
  provider: AutomationProvider;
  /** The WhatsApp connection's owner; null for external Green API credentials. */
  connectionUserId: string | null | undefined;
  integrationId?: string | null;
  providerResponse: unknown;
  /** The client a 1:1 send reached; asked only when the chat is not a client's group. */
  findClientRecipient?: () => Promise<string | null>;
  /** "automation" (the default) or "carmen" for Carmen's fallback replies. */
  sendKind?: "automation" | "carmen";
};

export type AutomationClientSendOutcome =
  "recorded" | "logging_off" | "not_client" | "skipped" | "failed";

/** Writes the stamped chat_messages row when the send reached a client: a group of one client, or the client findClientRecipient names. */
export async function recordAutomationClientSend(
  db: Pick<DbClient, "from" | "rpc">,
  send: AutomationClientSend,
): Promise<AutomationClientSendOutcome> {
  if (!send.tenantId || !send.connectionUserId || !send.chatId) {
    return "skipped";
  }
  try {
    const { data: loggingOn, error: flagError } = await db.rpc(
      "client_card_logs_system_sends",
      { p_tenant: send.tenantId },
    );
    if (flagError) {
      console.error("[client-card] client_card_logs_system_sends failed", {
        tenantId: send.tenantId,
        error: flagError,
      });
      return "logging_off";
    }
    if (loggingOn !== true) {
      return "logging_off";
    }

    const groupId = isGroupChatId(send.chatId)
      ? await findAutomationClientGroup(db, send)
      : null;
    const clientId = groupId
      ? null
      : ((await send.findClientRecipient?.()) ?? null);
    if (!groupId && !clientId) {
      return "not_client";
    }

    const { error } = await db
      .from("chat_messages")
      .insert(automationChatRow(send, { clientId, groupId }));
    if (error) {
      console.error("[client-card] chat_messages insert failed", error);
      return "failed";
    }
    return "recorded";
  } catch (err) {
    console.error("[client-card] system send not recorded", String(err));
    return "failed";
  }
}

/**
 * Carmen's reply that went straight to the provider (the webhook fallback).
 * Recorded like a reply through her automation's send step: only in a group
 * that belongs to one client, and only while the tenant has logging on.
 */
export function recordCarmenFallbackGroupReply(
  db: Pick<DbClient, "from" | "rpc">,
  send: Omit<AutomationClientSend, "findClientRecipient" | "sendKind">,
): Promise<AutomationClientSendOutcome> {
  if (!isGroupChatId(send.chatId)) {
    return Promise.resolve("not_client");
  }
  return recordAutomationClientSend(db, { ...send, sendKind: "carmen" });
}

/**
 * The whatsapp_groups id of a group chat in the tenant when the group belongs
 * to exactly one client (resolve_whatsapp_group_client); null otherwise.
 */
export async function findAutomationClientGroup(
  db: Pick<DbClient, "from" | "rpc">,
  input: { tenantId: string; chatId: string },
): Promise<string | null> {
  if (!input.tenantId || !isGroupChatId(input.chatId)) {
    return null;
  }
  try {
    const { data: group, error } = await db
      .from("whatsapp_groups")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("group_chat_id", input.chatId.trim())
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[client-card] whatsapp_groups lookup failed", {
        tenantId: input.tenantId,
        error,
      });
      return null;
    }
    if (typeof group?.id !== "string") {
      return null;
    }
    const { data: client, error: resolveError } = await db.rpc(
      "resolve_whatsapp_group_client",
      { p_group: group.id },
    );
    if (resolveError) {
      console.error("[client-card] resolve_whatsapp_group_client failed", {
        tenantId: input.tenantId,
        error: resolveError,
      });
      return null;
    }
    return typeof client === "string" && client ? group.id : null;
  } catch (err) {
    console.error("[client-card] group lookup failed", {
      tenantId: input.tenantId,
      error: String(err),
    });
    return null;
  }
}

/** The chat_messages row for a system send that reached a client. */
export function automationChatRow(
  send: AutomationClientSend,
  target: { clientId: string | null; groupId: string | null },
) {
  const response = isRecord(send.providerResponse) ? send.providerResponse : {};
  const kind = send.sendKind ?? "automation";
  return {
    tenant_id: send.tenantId,
    client_id: target.groupId ? null : target.clientId,
    group_id: target.groupId,
    connection_user_id: send.connectionUserId,
    integration_id: send.integrationId ?? null,
    sent_by_user_id: send.connectionUserId,
    message_text: send.message,
    direction: "outbound",
    channel: "whatsapp",
    provider: send.provider,
    sender_phone: target.groupId
      ? null
      : send.chatId.replace(/@.*$/, "").replace(/\D/g, "") || null,
    // The provider response stays top level (Green API's idMessage), so the
    // webhook's echo of this send is recognised as a duplicate. The echo
    // still owes the team-channel mirror it used to do (Green API only).
    raw_provider_data: {
      ...response,
      [kind]: true,
      ...(send.provider === "green_api"
        ? { team_forward: TEAM_FORWARD_PENDING }
        : {}),
    },
    send_kind: kind,
  };
}
