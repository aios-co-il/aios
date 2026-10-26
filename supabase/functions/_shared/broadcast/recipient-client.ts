// Which client a broadcast recipient is, so a 1:1 broadcast send stores
// chat_messages.client_id and can be logged on the client card (AIO-242).
import { phoneMatchKey } from "../telephony/phone.ts";

export type BroadcastRecipientLike = {
  entity_type?: string | null;
  entity_id?: string | null;
  phone?: string | null;
};

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * A client recipient is its entity_id. A manual recipient is the newest
 * client of the tenant with the same phone (find_phone_owner, the index-backed
 * match the telephony webhooks use). Leads, campaigners and groups are not
 * clients; a lookup failure resolves to null and never blocks the send.
 */
export async function resolveBroadcastRecipientClientId(
  db: RpcClient,
  tenantId: string,
  recipient: BroadcastRecipientLike,
): Promise<string | null> {
  if (recipient.entity_type === "client" && recipient.entity_id)
    return recipient.entity_id;
  if (recipient.entity_type !== "client" && recipient.entity_type !== "manual")
    return null;
  const matchKey = phoneMatchKey(recipient.phone);
  if (!tenantId || !matchKey) return null;
  try {
    const { data, error } = await db.rpc("find_phone_owner", {
      p_tenant_id: tenantId,
      p_match_key: matchKey,
    });
    if (error) return null;
    const row = (Array.isArray(data) ? data[0] : data) as
      { client_id?: unknown } | null | undefined;
    return typeof row?.client_id === "string" && row.client_id
      ? row.client_id
      : null;
  } catch {
    return null;
  }
}
