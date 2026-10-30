// An automation send is logged on a client's card only when the message went
// to the client itself: the client's own phone, or a WhatsApp group that
// belongs to exactly one client. A message to a lead, a team member or a
// manual number is never logged, even though its trigger payload often
// carries that client's id (a lead_created payload carries the routed
// client's client_id; a follow-up reminder to a team member carries the
// client it is about).
import { isGroupChatId } from "../_shared/carmen-session-identity.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { isRecord } from "../_shared/client-card/is-record.ts";
import { phoneMatchKey } from "../_shared/telephony/phone.ts";

/** The trigger payload fields that can name the client a step writes to. */
export type StepPayload = { client_id?: unknown; id?: unknown } | null;

/**
 * The candidate client (from the trigger payload) whose phone the message went
 * to, checked against clients.phone in the tenant; null otherwise.
 */
export async function findAutomationClientRecipient(
  db: Pick<DbClient, "from">,
  input: {
    tenantId: string;
    destination: string;
    candidateClientIds: unknown[];
  },
): Promise<string | null> {
  const ids = automationCandidateClientIds(input.candidateClientIds);
  if (
    !input.tenantId ||
    ids.length === 0 ||
    isGroupChatId(input.destination) ||
    !phoneMatchKey(input.destination)
  ) {
    return null;
  }
  try {
    const { data, error } = await db
      .from("clients")
      .select("id, phone")
      .eq("tenant_id", input.tenantId)
      .in("id", ids);
    if (error) {
      console.error("[trigger-automation] client recipient lookup failed", {
        tenantId: input.tenantId,
        error,
      });
      return null;
    }
    return Array.isArray(data)
      ? matchClientByPhone(input.destination, data)
      : null;
  } catch (err) {
    console.error("[trigger-automation] client recipient lookup failed", {
      tenantId: input.tenantId,
      error: String(err),
    });
    return null;
  }
}

/**
 * The client a Meta step's message reaches. Like the Green API / Manus step,
 * data.id is a candidate when the payload is the client row, unless it is
 * already sent as the lead id.
 */
export function findMetaStepClientRecipient(
  db: Pick<DbClient, "from">,
  input: {
    tenantId: string;
    phoneNumber: string;
    data: StepPayload;
    leadId: unknown;
  },
): Promise<string | null> {
  return findAutomationClientRecipient(db, {
    tenantId: input.tenantId,
    destination: input.phoneNumber,
    candidateClientIds: [
      input.data?.client_id,
      input.leadId === input.data?.id ? null : input.data?.id,
    ],
  });
}

/** Client ids a multi-recipient step names (a contact_lookup of a client). */
export function recipientClientIds(recipients: unknown): string[] {
  if (!Array.isArray(recipients)) {
    return [];
  }
  return automationCandidateClientIds(
    recipients.map((recipient) =>
      isRecord(recipient) &&
      recipient.type === "contact_lookup" &&
      recipient.entity === "client"
        ? recipient.id
        : null,
    ),
  );
}

/** Distinct non-empty string ids, in the order given. */
export function automationCandidateClientIds(values: unknown[]): string[] {
  const ids: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const id = value.trim();
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * The one client whose phone is the destination (a phone number or a 1:1
 * chat id). Null for a group, an unusable number, no match or several matches.
 */
export function matchClientByPhone(
  destination: string,
  clients: ReadonlyArray<{ id?: unknown; phone?: unknown }>,
): string | null {
  if (isGroupChatId(destination)) {
    return null;
  }
  const key = phoneMatchKey(destination);
  if (!key) {
    return null;
  }
  const matches = new Set<string>();
  for (const client of clients) {
    if (typeof client.id === "string" && phoneMatchKey(client.phone) === key) {
      matches.add(client.id);
    }
  }
  return matches.size === 1 ? [...matches][0] : null;
}
