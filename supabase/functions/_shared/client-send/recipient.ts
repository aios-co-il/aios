// Classifies a send address with resolve_send_recipient, the one classifier
// of send addresses, which the database owns
// (supabase/migrations/20261027120000_client_send_guard.sql).
import type { DbClient } from "../supabase-clients.ts";
import { addressShape } from "./address.ts";
import {
  RECIPIENT_KINDS,
  type RecipientKind,
  type SendChannel,
  type SendRecipient,
} from "./types.ts";

export const UNKNOWN_RECIPIENT: SendRecipient = {
  kind: "unknown",
  clientIds: [],
  leadId: null,
  groupId: null,
  ambiguous: false,
};

/**
 * The recipient behind an address, in the sending tenant's scope. An address
 * nothing can match is unknown without a lookup. Throws when the resolver
 * fails, so the guard fails closed.
 */
export async function resolveRecipient(
  db: Pick<DbClient, "rpc">,
  input: { tenantId: string; channel: SendChannel; address: string },
): Promise<SendRecipient> {
  const shape = addressShape(input.channel, input.address);
  if (shape.shape === "unusable") {
    return UNKNOWN_RECIPIENT;
  }
  const { data, error } = await db
    .rpc("resolve_send_recipient", {
      p_tenant_id: input.tenantId,
      p_shape: shape.shape,
      p_address: shape.address,
    })
    .single();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("resolve_send_recipient returned no row");
  }
  return {
    kind: recipientKind(data.recipient_kind),
    clientIds: data.client_ids ?? [],
    // The generator types a table function's columns as non-null.
    leadId: data.lead_id ?? null,
    groupId: data.group_id ?? null,
    ambiguous: data.ambiguous === true,
  };
}

/** The resolver's kind, or a throw when SQL and TypeScript drift apart. */
function recipientKind(value: string): RecipientKind {
  const kind = RECIPIENT_KINDS.find((known) => known === value);
  if (!kind) {
    throw new Error(`resolve_send_recipient returned kind ${value}`);
  }
  return kind;
}
