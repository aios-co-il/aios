import { resolveRecipient } from "../_shared/client-send/recipient.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { phoneMatchKey } from "../_shared/telephony/phone.ts";

export type PhoneCallerKind = "staff" | "client" | "unknown";

/** Who is on the line, as the server decided it from the caller's number. */
export type PhoneCaller = {
  kind: PhoneCallerKind;
  phone: string | null;
  name: string | null;
  clientIds: Array<string>;
  clientNames: Array<string>;
  campaignerId: string | null;
};

type CallerDb = Pick<DbClient, "from" | "rpc">;

const LOG = "[carmen-phone]";

/**
 * Classifies the caller with resolve_send_recipient, the one classifier of addresses: the org's
 * team, one of its clients' numbers, or unknown. A hidden number or a failed lookup is unknown,
 * the kind that may learn the least.
 */
export async function identifyCaller(
  db: CallerDb,
  tenantId: string,
  phone: string | null,
): Promise<PhoneCaller> {
  const unknown = unknownCaller(phone);
  if (!phone || !phoneMatchKey(phone)) {
    return unknown;
  }
  try {
    const recipient = await resolveRecipient(db, {
      tenantId,
      channel: "whatsapp",
      address: phone,
      groupId: null,
    });
    // Only this org's own team is staff. resolve_send_recipient's "staff" kind also covers related
    // orgs (parent, child, shared agencies), whose people must not hear this org's brief.
    if (recipient?.senderStaff) {
      return {
        ...unknown,
        kind: "staff",
        ...(await staffMember(db, tenantId, phone)),
      };
    }
    if (
      (recipient?.kind === "client" || recipient?.kind === "client_contact") &&
      recipient.clientIds.length > 0
    ) {
      return {
        ...unknown,
        kind: "client",
        clientIds: recipient.clientIds,
        clientNames: await clientNames(db, recipient.clientIds),
      };
    }
  } catch (e) {
    console.error(`${LOG} caller lookup failed; treating as unknown`, e);
  }
  return unknown;
}

/** A caller nothing matched. */
function unknownCaller(phone: string | null): PhoneCaller {
  return {
    kind: "unknown",
    phone,
    name: null,
    clientIds: [],
    clientNames: [],
    campaignerId: null,
  };
}

/** The team member's name and campaigner row, when the number is an active campaigner's. */
async function staffMember(
  db: CallerDb,
  tenantId: string,
  phone: string,
): Promise<{ name: string | null; campaignerId: string | null }> {
  const { data, error } = await db
    .from("campaigners")
    .select("id, full_name, phone")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  if (error) {
    console.error(`${LOG} campaigners read failed`, error.message);
  }
  const key = phoneMatchKey(phone);
  const match = (data ?? []).find((c) => phoneMatchKey(c.phone) === key);
  return { name: match?.full_name ?? null, campaignerId: match?.id ?? null };
}

/** The clients' names, for Carmen's greeting and the team's messages. */
async function clientNames(
  db: CallerDb,
  clientIds: Array<string>,
): Promise<Array<string>> {
  const { data, error } = await db
    .from("clients")
    .select("name")
    .in("id", clientIds);
  if (error) {
    console.error(`${LOG} client names read failed`, error.message);
  }
  return (data ?? []).map((c) => c.name).filter(Boolean);
}
