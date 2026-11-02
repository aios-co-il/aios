// client_send_refusals: each send the guard refused, or would refuse once an
// observed rule is enforced. No phone or email is written or logged, only
// what the address resolved to.
import type { Database } from "../database.types.ts";
import type { DbClient } from "../supabase-clients.ts";
import { asUuidOrNull } from "../uuid.ts";
import {
  type ClientSendRefusal,
  type ClientSendRequest,
  type SendRecipient,
  UNRESOLVED_RECIPIENT,
} from "./types.ts";

type RefusalRow =
  Database["public"]["Tables"]["client_send_refusals"]["Insert"];

/**
 * Records the refusal. Logs its own failure and never throws: the decision
 * stands whether or not the row was written.
 */
export async function recordClientSendRefusal(
  db: Pick<DbClient, "from">,
  request: ClientSendRequest,
  recipient: SendRecipient | null,
  reason: ClientSendRefusal,
  enforced: boolean,
): Promise<void> {
  const row = refusalRow(request, recipient, reason, enforced);
  console.warn(
    enforced
      ? "[client-send] refused an automatic send"
      : "[client-send] would refuse an automatic send (observed)",
    row,
  );
  try {
    const { error } = await db.from("client_send_refusals").insert(row);
    if (error) {
      console.error("[client-send] refusal log insert failed", {
        reason,
        error,
      });
    }
  } catch (error) {
    console.error("[client-send] refusal log insert threw", { reason, error });
  }
}

/**
 * The row: the subject client when it was matched, else the first match.
 * send_ref is kept only as a uuid, the shape of every proof today: a free
 * text ref (AIO-248's Carmen message ids) could carry a chat id, a phone.
 */
function refusalRow(
  request: ClientSendRequest,
  recipient: SendRecipient | null,
  reason: ClientSendRefusal,
  enforced: boolean,
): RefusalRow {
  const subject = request.subjectClientId;
  const matched = recipient?.clientIds ?? [];
  return {
    tenant_id: request.tenantId,
    function_name: request.functionName,
    channel: request.channel,
    recipient_kind: recipient?.kind ?? UNRESOLVED_RECIPIENT,
    client_id:
      subject && matched.includes(subject) ? subject : (matched[0] ?? null),
    lead_id: recipient?.leadId ?? null,
    group_id: recipient?.groupId ?? null,
    send_kind: request.sendKind,
    send_ref: asUuidOrNull(request.sendRef),
    subject_client_id: subject,
    reason,
    enforced,
  };
}
