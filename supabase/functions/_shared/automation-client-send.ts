// Automation WhatsApp sends that reached a client, for the client card
// auto-log (AIO-242).
//
// An automation send is stamped send_kind "automation" only when the message
// went to the client itself: the client's own phone, or a WhatsApp group that
// belongs to exactly one client. A message to a lead, a team member or a
// manual number is never logged on a client's card, even though its trigger
// payload often carries that client's id (a lead_created payload carries the
// routed client's client_id; a follow-up reminder to a team member carries
// the client it is about).
//
// trigger-automation's Meta step passes the stamp to send-meta-whatsapp-message,
// which writes the chat_messages row. Its Green API / Manus steps post to the
// provider directly and write no row, so recordAutomationClientSend writes the
// stamped row after a send that reached a client. It does so only while the
// tenant has card logging on, so a tenant that never turns it on sees no
// change, and it never throws: the message has already gone out. Carmen's
// webhook-fallback replies (sent straight to the provider when her automation
// has no send step, or that send failed) are recorded the same way, as
// send_kind "carmen", and only in a group that belongs to one client, like a
// reply through the action step.
//
// Green API echoes every API send back to green-api-webhook
// (outgoingAPIMessageReceived). Before this row existed the echo stored the
// message and mirrored it to linked team channels. The echo now finds this
// row and skips it, so a Green API row starts with
// raw_provider_data.team_forward "pending" and the echo claims the mirror
// once (claimStoredSendTeamForward). When the two writes cross, the
// merge_green_api_send_echo trigger
// (supabase/migrations/20261026136000_client_card_system_send_log.sql) keeps
// one row: the echo is dropped, or this row's kind is stamped on the echo's
// row, which has already been mirrored.
import { phoneMatchKey } from "./telephony/phone.ts";

type QueryResult = { data: unknown; error: unknown };

// The PostgREST builder surface these helpers use.
// deno-lint-ignore no-explicit-any
export type AutomationSendDb = { from: (table: string) => any } & {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<QueryResult>;
};

export type AutomationProvider = "green_api" | "manus_wa";

export function isGroupChatId(chatId: unknown): boolean {
  return typeof chatId === "string" && /@g\.us$/i.test(chatId.trim());
}

/** Distinct non-empty string ids, in the order given. */
export function automationCandidateClientIds(values: unknown[]): string[] {
  const ids: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Client ids a multi-recipient step names (a contact_lookup of a client). */
export function recipientClientIds(recipients: unknown): string[] {
  if (!Array.isArray(recipients)) return [];
  return automationCandidateClientIds(
    recipients.map((recipient) =>
      recipient &&
      typeof recipient === "object" &&
      (recipient as Record<string, unknown>).type === "contact_lookup" &&
      (recipient as Record<string, unknown>).entity === "client"
        ? (recipient as Record<string, unknown>).id
        : null,
    ),
  );
}

/**
 * The one client whose phone is the destination (a phone number or a 1:1
 * chat id). Null for a group, an unusable number, no match or several matches.
 */
export function matchClientByPhone(
  destination: unknown,
  clients: ReadonlyArray<{ id?: unknown; phone?: unknown }>,
): string | null {
  if (isGroupChatId(destination)) return null;
  const key = phoneMatchKey(destination);
  if (!key) return null;
  const matches = new Set<string>();
  for (const client of clients) {
    if (typeof client.id === "string" && phoneMatchKey(client.phone) === key)
      matches.add(client.id);
  }
  return matches.size === 1 ? [...matches][0] : null;
}

/**
 * The candidate client (from the trigger payload) whose phone the message went
 * to, checked against clients.phone in the tenant; null otherwise.
 */
export async function findAutomationClientRecipient(
  db: AutomationSendDb,
  input: {
    tenantId: string;
    destination: unknown;
    candidateClientIds: unknown[];
  },
): Promise<string | null> {
  const ids = automationCandidateClientIds(input.candidateClientIds);
  if (
    !input.tenantId ||
    ids.length === 0 ||
    isGroupChatId(input.destination) ||
    !phoneMatchKey(input.destination)
  )
    return null;
  try {
    const { data, error } = await db
      .from("clients")
      .select("id, phone")
      .eq("tenant_id", input.tenantId)
      .in("id", ids);
    if (error || !Array.isArray(data)) return null;
    return matchClientByPhone(input.destination, data);
  } catch {
    return null;
  }
}

/**
 * The whatsapp_groups id of a group chat in the tenant when the group belongs
 * to exactly one client (resolve_whatsapp_group_client); null otherwise.
 */
export async function findAutomationClientGroup(
  db: AutomationSendDb,
  input: { tenantId: string; chatId: string },
): Promise<string | null> {
  if (!input.tenantId || !isGroupChatId(input.chatId)) return null;
  try {
    const { data: group, error } = await db
      .from("whatsapp_groups")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("group_chat_id", input.chatId.trim())
      .limit(1)
      .maybeSingle();
    const groupId = (group as { id?: unknown } | null)?.id;
    if (error || typeof groupId !== "string") return null;
    const { data: client, error: resolveError } = await db.rpc(
      "resolve_whatsapp_group_client",
      { p_group: groupId },
    );
    return !resolveError && typeof client === "string" && client
      ? groupId
      : null;
  } catch {
    return null;
  }
}

export type AutomationClientSend = {
  tenantId: string;
  chatId: string;
  message: string;
  provider: AutomationProvider;
  /** The WhatsApp connection's owner; null for external Green API credentials. */
  connectionUserId: string | null | undefined;
  integrationId?: string | null;
  providerResponse: unknown;
  /** Client ids from the trigger payload and the resolved contact. */
  candidateClientIds: unknown[];
  /** "automation" (the default) or "carmen" for Carmen's fallback replies. */
  sendKind?: "automation" | "carmen";
};

/** raw_provider_data.team_forward of a Green API row the echo still mirrors. */
export const TEAM_FORWARD_PENDING = "pending";
export const TEAM_FORWARD_DONE = "done";

/** The chat_messages row for an automation send that reached a client. */
export function automationChatRow(
  send: AutomationClientSend,
  target: { clientId: string | null; groupId: string | null },
): Record<string, unknown> {
  const response =
    send.providerResponse && typeof send.providerResponse === "object"
      ? (send.providerResponse as Record<string, unknown>)
      : {};
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

export type AutomationClientSendOutcome =
  "recorded" | "logging_off" | "not_client" | "skipped" | "failed";

/** Writes the stamped chat_messages row when the send reached a client. */
export async function recordAutomationClientSend(
  db: AutomationSendDb,
  send: AutomationClientSend,
): Promise<AutomationClientSendOutcome> {
  if (!send.tenantId || !send.connectionUserId || !send.chatId)
    return "skipped";
  try {
    const { data: loggingOn, error: flagError } = await db.rpc(
      "client_card_logs_system_sends",
      { p_tenant: send.tenantId },
    );
    if (flagError || loggingOn !== true) return "logging_off";

    const groupId = isGroupChatId(send.chatId)
      ? await findAutomationClientGroup(db, send)
      : null;
    const clientId = groupId
      ? null
      : await findAutomationClientRecipient(db, {
          tenantId: send.tenantId,
          destination: send.chatId,
          candidateClientIds: send.candidateClientIds,
        });
    if (!groupId && !clientId) return "not_client";

    const { error } = await db
      .from("chat_messages")
      .insert(automationChatRow(send, { clientId, groupId }));
    if (error) {
      console.error(
        "[automation-client-send] chat_messages insert failed",
        error,
      );
      return "failed";
    }
    return "recorded";
  } catch (err) {
    console.error("[automation-client-send] not recorded", String(err));
    return "failed";
  }
}

/**
 * Carmen's reply that went straight to the provider (the webhook fallback).
 * Recorded like a reply through her automation's send step: only in a group
 * that belongs to one client, and only while the tenant has logging on.
 */
export function recordCarmenFallbackGroupReply(
  db: AutomationSendDb,
  send: Omit<AutomationClientSend, "candidateClientIds" | "sendKind">,
): Promise<AutomationClientSendOutcome> {
  if (!isGroupChatId(send.chatId)) return Promise.resolve("not_client");
  return recordAutomationClientSend(db, {
    ...send,
    candidateClientIds: [],
    sendKind: "carmen",
  });
}

export type StoredSendTeamForward = {
  id: string;
  groupId: string | null;
  messageText: string;
};

/**
 * Claims the team-channel mirror of a Green API send stored before its echo
 * (team_forward "pending"): flips it to "done" and returns the row only for
 * the call that flipped it, so a redelivered echo never mirrors it twice.
 * Null when nothing is owed. Never throws.
 */
export async function claimStoredSendTeamForward(
  db: AutomationSendDb,
  key: {
    tenantId: string;
    connectionUserId: string | null | undefined;
    idMessage: unknown;
  },
): Promise<StoredSendTeamForward | null> {
  const idMessage =
    typeof key.idMessage === "string" ? key.idMessage.trim() : "";
  if (!key.tenantId || !key.connectionUserId || !idMessage) return null;
  try {
    const { data: row, error } = await db
      .from("chat_messages")
      .select("id, group_id, message_text, raw_provider_data")
      .eq("tenant_id", key.tenantId)
      .eq("connection_user_id", key.connectionUserId)
      .eq("raw_provider_data->>idMessage", idMessage)
      .eq("raw_provider_data->>team_forward", TEAM_FORWARD_PENDING)
      .limit(1)
      .maybeSingle();
    const stored = row as Record<string, unknown> | null;
    if (error || typeof stored?.id !== "string") return null;
    const raw =
      stored.raw_provider_data && typeof stored.raw_provider_data === "object"
        ? (stored.raw_provider_data as Record<string, unknown>)
        : {};
    const { data: claimed, error: claimError } = await db
      .from("chat_messages")
      .update({
        raw_provider_data: { ...raw, team_forward: TEAM_FORWARD_DONE },
      })
      .eq("id", stored.id)
      .eq("raw_provider_data->>team_forward", TEAM_FORWARD_PENDING)
      .select("id");
    if (claimError || !Array.isArray(claimed) || claimed.length === 0)
      return null;
    return {
      id: stored.id,
      groupId: typeof stored.group_id === "string" ? stored.group_id : null,
      messageText:
        typeof stored.message_text === "string" ? stored.message_text : "",
    };
  } catch (err) {
    console.error(
      "[automation-client-send] team forward claim failed",
      String(err),
    );
    return null;
  }
}
