// Applies the rule of a send's kind (rules.ts) to a client-side recipient,
// with the proofs and card switches it asks for. Lookups throw on failure;
// authorize.ts turns a throw into guard_error.
import type { DbClient } from "../supabase-clients.ts";
import { isOptedIn } from "./opt-in.ts";
import {
  automationTarget,
  broadcastIsSending,
  reportScheduleClient,
} from "./proofs.ts";
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
    case "report_schedule":
      return await reportRefusal(db, request, recipient);
    case "broadcast_sending":
      return await broadcastRefusal(db, request);
    case "automation":
      return await automationRefusal(db, request, recipient);
    case "opt_in":
      return await optInRefusal(db, request, recipient, rule.kind);
  }
}

/** The schedule in send_ref is enabled here and reports on this recipient. */
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
  return recipient.clientIds.includes(clientId) ? null : "subject_mismatch";
}

/** The broadcast in send_ref is this tenant's and is being dispatched. */
async function broadcastRefusal(
  db: ClientSendDb,
  request: ClientSendRequest,
): Promise<ClientSendRefusal | null> {
  if (!request.sendRef) {
    return "proof_missing";
  }
  const sending = await broadcastIsSending(db, {
    tenantId: request.tenantId,
    broadcastId: request.sendRef,
  });
  return sending ? null : "proof_invalid";
}

/**
 * The automation in send_ref runs here. Set for one client that this
 * recipient belongs to, it passes; otherwise the card's switch decides.
 */
async function automationRefusal(
  db: ClientSendDb,
  request: ClientSendRequest,
  recipient: SendRecipient,
): Promise<ClientSendRefusal | null> {
  if (!request.sendRef) {
    return "automation_without_ref";
  }
  const automation = await automationTarget(db, {
    tenantId: request.tenantId,
    automationId: request.sendRef,
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
