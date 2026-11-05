// The client send guard (AIO-261): a client gets no automatic message unless
// something the tenant set up asked for it. Each sender takes the guard step
// in sender-step.ts (refuseClientSend, or refuseClientSendWith and
// clientSendRefusalOf over an injected guard) after its tenant, membership
// and chat-id checks and before it sends; the rules per send kind are in
// rules.ts and are applied by rule-check.ts.
import { normalizeSendRef, resolveSendKind } from "../client-card/send-kind.ts";
import { asUuidOrNull } from "../uuid.ts";
import { resolveRecipient } from "./recipient.ts";
import { recordClientSendRefusal } from "./refusal-log.ts";
import { isClientSide, isObservedRefusal } from "./rules.ts";
import { clientRefusal, type ClientSendDb } from "./rule-check.ts";
import type {
  ClientSendDecision,
  ClientSendRefusal,
  ClientSendRequest,
  SendRecipient,
  SenderSend,
} from "./types.ts";

/**
 * A person's send passes without a lookup. A system send to a client, a
 * client's contact or a client's group must pass its kind's rule; an observed
 * refusal is logged and let through, any other is logged and refused. An
 * address nothing can match is logged as observed. A failed lookup refuses
 * (guard_error): the guard fails closed.
 */
export async function authorizeClientSend(
  db: ClientSendDb,
  request: ClientSendRequest,
): Promise<ClientSendDecision> {
  if (request.origin === "person") {
    return { allowed: true, recipient: null, observed: null };
  }
  let recipient: SendRecipient | null = null;
  let reason: ClientSendRefusal | null;
  try {
    recipient = await resolveRecipient(db, request);
    reason = await recipientRefusal(db, request, recipient);
  } catch (error) {
    console.error("[client-send] guard lookup failed; refusing", {
      functionName: request.functionName,
      tenantId: request.tenantId,
      error,
    });
    reason = "guard_error";
  }
  if (!reason) {
    return { allowed: true, recipient, observed: null };
  }
  const enforced = !isObservedRefusal(reason);
  await recordClientSendRefusal(db, request, recipient, reason, enforced);
  return enforced
    ? { allowed: false, reason, recipient }
    : { allowed: true, recipient, observed: reason };
}

/** Why the recipient may not get this send, or null when nothing refuses. */
async function recipientRefusal(
  db: ClientSendDb,
  request: ClientSendRequest,
  recipient: SendRecipient | null,
): Promise<ClientSendRefusal | null> {
  if (!recipient) {
    return "unresolvable_address";
  }
  return isClientSide(recipient)
    ? await clientRefusal(db, request, recipient)
    : null;
}

/** The guard's request from a sender's checked values and raw body fields. */
export function clientSendRequest(send: SenderSend): ClientSendRequest {
  return {
    functionName: send.functionName,
    tenantId: send.tenantId,
    channel: send.channel,
    address: send.address,
    groupId: asUuidOrNull(send.groupId),
    origin: send.isServiceRole ? "system" : "person",
    sendKind: resolveSendKind({
      requested: send.body.sendKind,
      isServiceRole: send.isServiceRole,
    }),
    sendRef: normalizeSendRef(send.body.sendRef),
    subjectClientId: asUuidOrNull(send.body.clientId),
  };
}
