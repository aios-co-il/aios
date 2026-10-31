// Applies the rule of a send's kind (rules.ts) to a client-side recipient,
// with the proofs and card switches it asks for. Lookups throw on failure;
// authorize.ts turns a throw into guard_error.
import type { DbClient } from "../supabase-clients.ts";
import { isOptedIn } from "./opt-in.ts";
import { sendingBroadcast } from "./broadcast-proof.ts";
import { automationTarget, reportScheduleClient } from "./proofs.ts";
import {
  CLIENT_RULES,
  type ClientAutoSendKind,
  optInKindForAutomation,
  optInTarget,
  UNCLASSIFIED_RULE,
} from "./rules.ts";
import type {
  ClientSendRefusal,
  ClientSendRequest,
  SendRecipient,
} from "./types.ts";

export type ClientSendDb = Pick<DbClient, "rpc" | "from">;

/** Why the rule of this send's kind refuses it, or null when it passes. */
export async function clientRefusal(
  db: ClientSendDb,
  request: ClientSendRequest,
  recipient: SendRecipient,
): Promise<ClientSendRefusal | null> {
  const rule = request.sendKind
    ? CLIENT_RULES[request.sendKind]
    : UNCLASSIFIED_RULE;
  switch (rule.proof) {
    case "never":
      return rule.refusal;
    case "sender_staff":
      return recipient.senderStaff ? null : rule.refusal;
    case "report_schedule":
      return await reportRefusal(db, request, recipient);
    case "broadcast_sending":
      return await broadcastRefusal(db, request, recipient);
    case "automation":
      return await automationRefusal(db, request, recipient);
    case "opt_in":
      return await optInRefusal(db, request, recipient, rule.kind);
  }
}

/**
 * The schedule in send_ref is enabled here and reports on this recipient,
 * or the recipient is the sending tenant's own staff, who may get a report
 * on any of its clients.
 */
async function reportRefusal(
  db: ClientSendDb,
  request: ClientSendRequest,
  recipient: SendRecipient,
): Promise<ClientSendRefusal | null> {
  if (!request.sendRef) {
    return "proof_missing";
  }
  const clientId = await reportScheduleClient(db, {
    tenantId: request.tenantId,
    scheduleId: request.sendRef,
  });
  if (!clientId) {
    return "proof_invalid";
  }
  return recipient.clientIds.includes(clientId) || recipient.senderStaff
    ? null
    : "subject_mismatch";
}

/**
 * The broadcast in send_ref is this tenant's, is being dispatched and lists
 * this address. An automation's template stream is always dispatching, so
 * its automation's rule decides, and is only observed until AIO-267.
 */
async function broadcastRefusal(
  db: ClientSendDb,
  request: ClientSendRequest,
  recipient: SendRecipient,
): Promise<ClientSendRefusal | null> {
  if (!request.sendRef) {
    return "proof_missing";
  }
  const broadcast = await sendingBroadcast(db, {
    ...request,
    broadcastId: request.sendRef,
  });
  if (!broadcast) {
    return "proof_invalid";
  }
  if (!broadcast.automationStream) {
    return null;
  }
  const refusal = broadcast.automationId
    ? await automationRuleRefusal(
        db,
        request,
        recipient,
        broadcast.automationId,
      )
    : "proof_invalid";
  return refusal ? "automation_broadcast_unverified" : null;
}

/** An automation send names its automation in send_ref. */
async function automationRefusal(
  db: ClientSendDb,
  request: ClientSendRequest,
  recipient: SendRecipient,
): Promise<ClientSendRefusal | null> {
  if (!request.sendRef) {
    return "automation_without_ref";
  }
  return await automationRuleRefusal(db, request, recipient, request.sendRef);
}

/**
 * The automation runs here. Set for one client that this recipient belongs
 * to, it passes; otherwise the card's switch decides.
 */
async function automationRuleRefusal(
  db: ClientSendDb,
  request: ClientSendRequest,
  recipient: SendRecipient,
  automationId: string,
): Promise<ClientSendRefusal | null> {
  const automation = await automationTarget(db, {
    tenantId: request.tenantId,
    automationId,
  });
  if (!automation) {
    return "proof_invalid";
  }
  if (
    automation.clientId &&
    recipient.clientIds.includes(automation.clientId)
  ) {
    return null;
  }
  const kind = optInKindForAutomation(automation.triggerType);
  return await optInRefusal(db, request, recipient, kind);
}

/** The subject client is this recipient's, alone, and its card says yes. */
async function optInRefusal(
  db: ClientSendDb,
  request: ClientSendRequest,
  recipient: SendRecipient,
  kind: ClientAutoSendKind,
): Promise<ClientSendRefusal | null> {
  const clientId = request.subjectClientId;
  if (!clientId) {
    return "no_subject";
  }
  if (!recipient.clientIds.includes(clientId)) {
    return "subject_mismatch";
  }
  if (recipient.ambiguous) {
    return "ambiguous_group";
  }
  const target = optInTarget(request.channel, recipient);
  const optedIn =
    target !== null &&
    (await isOptedIn(db, {
      tenantId: request.tenantId,
      clientId,
      kind,
      target,
    }));
  return optedIn ? null : "not_opted_in";
}
