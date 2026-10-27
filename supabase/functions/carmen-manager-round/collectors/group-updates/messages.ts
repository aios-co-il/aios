/**
 * Messages of the WhatsApp groups linked to one client each, through the
 * service-role function get_client_group_digest_messages: groups only, the
 * tenant's own stored copy, senders as phone match keys (never raw phones).
 */
import type { Database, Json } from "../../../_shared/database.types.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";

type GroupRow =
  Database["public"]["Functions"]["get_client_group_digest_messages"]["Returns"][number];

export type GroupMessage = {
  id: string;
  at: string;
  /** Sent from the monitored line itself or by a person in AIOS. */
  out: boolean;
  /** phone_match_key of the sender, or null when unknown. */
  key: string | null;
  text: string;
};

export type GroupHistory = Omit<GroupRow, "messages"> & {
  messages: GroupMessage[];
};

/** At most this many recent messages per group reach the collector. */
export const PER_GROUP = 60;

/** Every linked group's messages after `since`, optionally for some clients only. */
export async function loadGroupHistories(
  db: DbClient,
  query: { tenantId: string; since: Date; clientIds: string[] | null },
): Promise<GroupHistory[]> {
  const { data, error } = await db.rpc("get_client_group_digest_messages", {
    p_tenant_id: query.tenantId,
    p_since: query.since.toISOString(),
    p_client_ids: query.clientIds ?? undefined,
    p_per_group: PER_GROUP,
  });
  throwIf(error, "get_client_group_digest_messages");
  return (data ?? []).map(groupHistory);
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
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }
  const { id, at, out, key, text } = item;
  if (typeof id !== "string" || typeof at !== "string") {
    return null;
  }
  return {
    id,
    at,
    out: out === true,
    key: typeof key === "string" ? key : null,
    text: typeof text === "string" ? text : "",
  };
}
