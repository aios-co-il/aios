/**
 * Messages of the WhatsApp groups linked to one client each, through the
 * service-role function get_client_group_digest_messages: groups only, as
 * stored by the monitored lines, one reader per group_chat_id, senders as
 * phone match keys (never raw phones). The tenant's Carmen line adds the
 * groups no Green line read, without Carmen's own sends (AIO-515).
 */
import type { Database, Json } from "../../../_shared/database.types.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../../_shared/manager-round/db-error.ts";
import { jsonObject } from "../../../_shared/pulse/json.ts";
import { CARMEN_PROVIDER, MONITORED_PROVIDER } from "../chat/activity.ts";
import { carmenOnlyGroups } from "../chat/carmen-line.ts";

type GroupRow =
  Database["public"]["Functions"]["get_client_group_digest_messages"]["Returns"][number];

export type GroupMessage = {
  id: string;
  /** The provider's message id (Green idMessage, else the row id). */
  providerId: string;
  at: string;
  /** Sent from the monitored line itself or by a person in AIOS. */
  out: boolean;
  /** The AIOS user who sent it from AIOS, when one did. */
  sentBy: string | null;
  /** chat_messages.send_kind (_shared/client-card/send-kind.ts); null when none was stored. */
  sendKind: string | null;
  /** Outbound, typed on the line's phone in WhatsApp rather than sent through the API. */
  typedOnPhone: boolean;
  /** The user of the line that stored it (chat_messages.connection_user_id). */
  lineUserId: string | null;
  /** phone_match_key of the sender, or null when unknown. */
  key: string | null;
  /** An @lid sender with no known phone: neither client nor staff. */
  lidUnmapped: boolean;
  text: string;
};

export type GroupHistory = Omit<GroupRow, "messages"> & {
  messages: GroupMessage[];
};

/** At most this many recent messages per group reach the collector. */
export const PER_GROUP = 60;

export type HistoryQuery = {
  tenantId: string;
  /** chat_messages.connection_user_id of the members' Green lines (chat/connections.ts). */
  connectionIds: string[];
  /** The tenant's Carmen (Manus) lines. */
  carmenConnectionIds: Array<string>;
  since: Date;
  clientIds: string[] | null;
};

/**
 * Every linked group's messages after `since`, optionally for some clients
 * only: the Green lines' groups, then Carmen's groups no Green line read.
 * `collectorId` lets the function leave a shared group to the client's own
 * tenant when that tenant's run reads it.
 */
export async function loadGroupHistories(
  db: DbClient,
  query: HistoryQuery,
  collectorId: string,
): Promise<Array<GroupHistory>> {
  const read = (lines: Array<string>, provider: Provider) =>
    readHistories(db, query, { lines, provider, collectorId });
  const [green, carmen] = await Promise.all([
    read(query.connectionIds, MONITORED_PROVIDER),
    read(query.carmenConnectionIds, CARMEN_PROVIDER),
  ]);
  return [...green, ...carmenOnlyGroups(carmen, green).map(withoutCarmenSends)];
}

type Provider = typeof MONITORED_PROVIDER | typeof CARMEN_PROVIDER;

/** One provider's linked groups as stored by `lines`. */
async function readHistories(
  db: DbClient,
  query: HistoryQuery,
  read: { lines: Array<string>; provider: Provider; collectorId: string },
): Promise<Array<GroupHistory>> {
  if (!read.lines.length) {
    return [];
  }
  const { data, error } = await db.rpc("get_client_group_digest_messages", {
    p_tenant_id: query.tenantId,
    p_connection_user_ids: read.lines,
    p_since: query.since.toISOString(),
    p_collector: read.collectorId,
    p_provider: read.provider,
    p_client_ids: query.clientIds ?? undefined,
    p_per_group: PER_GROUP,
  });
  throwIf(error, "get_client_group_digest_messages");
  return (data ?? []).map(groupHistory);
}

/**
 * A Carmen-line group without what Carmen's line sent itself: those are
 * Carmen's words, neither the staff's nor the client's. A send a person made
 * from AIOS (sentBy) stays.
 */
function withoutCarmenSends(history: GroupHistory): GroupHistory {
  return {
    ...history,
    messages: history.messages.filter(
      (message) => !message.out || message.sentBy !== null,
    ),
  };
}

/** A row with its messages parsed; malformed messages are dropped. */
export function groupHistory(row: GroupRow): GroupHistory {
  return { ...row, messages: parseMessages(row.messages) };
}

/** The well-formed messages of the JSON array, oldest first. */
function parseMessages(raw: Json): GroupMessage[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .flatMap((item) => {
      const message = parseMessage(item);
      return message ? [message] : [];
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** One message, or null when a required field is missing. */
function parseMessage(item: Json): GroupMessage | null {
  const row = jsonObject(item);
  if (!row) {
    return null;
  }
  const { id, provider_id, at, out, sent_by, send_kind, key } = row;
  if (typeof id !== "string" || typeof at !== "string") {
    return null;
  }
  return {
    id,
    providerId: typeof provider_id === "string" ? provider_id : id,
    at,
    out: out === true,
    sentBy: typeof sent_by === "string" ? sent_by : null,
    sendKind: typeof send_kind === "string" ? send_kind : null,
    typedOnPhone: row.typed_on_phone === true,
    lineUserId: typeof row.line_user === "string" ? row.line_user : null,
    key: typeof key === "string" ? key : null,
    lidUnmapped: row.lid_unmapped === true,
    text: typeof row.text === "string" ? row.text : "",
  };
}
