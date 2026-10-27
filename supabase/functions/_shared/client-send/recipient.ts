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

/**
 * The recipient behind an address, in the sending tenant's scope; null,
 * without a lookup, for an address nothing can match. Throws when the
 * resolver fails, so the guard fails closed.
 */
export async function resolveRecipient(
  db: Pick<DbClient, "rpc">,
  input: {
    tenantId: string;
    channel: SendChannel;
    address: string;
    groupId: string | null;
  },
): Promise<SendRecipient | null> {
  const shape = addressShape(input);
  if (shape.shape === "unusable") {
    return null;
  }
  const { data, error } = await db
    .rpc("resolve_send_recipient", {
      p_tenant_id: input.tenantId,
      p_shape: shape.shape,
      p_address: shape.address,
      // Left out when the send names no group row: the SQL default.
      ...(input.groupId ? { p_group_id: input.groupId } : {}),
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
    senderStaff: data.sender_staff === true,
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
