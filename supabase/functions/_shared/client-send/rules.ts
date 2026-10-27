// What an automatic send to a client, a client's contact or a client's group
// must show, per send kind (AIO-261). A person's send, and any send to a
// lead, staff or an unknown address, never reaches these rules
// (authorize.ts). A kind added to SEND_KINDS needs its rule here.
import type { SendKind } from "../client-card/send-kind.ts";
import type { Database } from "../database.types.ts";
import type { ClientSendRefusal, SendChannel, SendRecipient } from "./types.ts";

export type ClientAutoSendKind =
  Database["public"]["Enums"]["client_auto_send_kind"];

export type ClientAutoSendTarget =
  Database["public"]["Enums"]["client_auto_send_target"];

/**
 * `never`: refused whatever it carries. `report_schedule`, `broadcast_sending`
 * and `automation`: the send_ref must prove what asked for it (proofs.ts).
 * `opt_in`: the client card's switch for that kind and target.
 */
export type ClientRule =
  | { proof: "never"; refusal: ClientSendRefusal }
  | { proof: "report_schedule" }
  | { proof: "broadcast_sending" }
  | { proof: "automation" }
  | { proof: "opt_in"; kind: ClientAutoSendKind };

export const CLIENT_RULES: Record<SendKind, ClientRule> = {
  chat: { proof: "never", refusal: "person_only_kind" },
  dashboard_share: { proof: "never", refusal: "person_only_kind" },
  meeting_summary: { proof: "never", refusal: "person_only_kind" },
  staff_alert: { proof: "never", refusal: "staff_only" },
  report: { proof: "report_schedule" },
  broadcast: { proof: "broadcast_sending" },
  automation: { proof: "automation" },
  // AIO-248 replaces this with Carmen's proofs: the inbound message she
  // answers, a person's approval, an approved identity.
  carmen: { proof: "never", refusal: "carmen_unverified" },
};

/** The rule of a service-role send that names no kind. */
export const UNCLASSIFIED_RULE: ClientRule = {
  proof: "never",
  refusal: "unclassified_service_send",
};

/**
 * Refusals that are logged (enforced = false) and let through until the
 * named issue lands; every other refusal blocks the send. The scan test
 * (call-sites.test.ts) ties unclassified_service_send to its callers.
 */
export const OBSERVED_REFUSALS: Readonly<
  Partial<Record<ClientSendRefusal, string>>
> = {
  unclassified_service_send:
    "AIO-248 and AIO-267 stamp the remaining service-role callers",
  automation_without_ref: "AIO-267 passes the automation id as send_ref",
  carmen_unverified: "AIO-248 adds Carmen's proofs",
};

/** Whether a refusal is only logged for now. */
export function isObservedRefusal(reason: ClientSendRefusal): boolean {
  return Object.hasOwn(OBSERVED_REFUSALS, reason);
}

/** Whether the guard's client rules apply to this recipient. */
export function isClientSide(recipient: SendRecipient): boolean {
  return (
    recipient.kind === "client" ||
    recipient.kind === "client_contact" ||
    recipient.kind === "client_group"
  );
}

const LEAD_ALERT_TRIGGERS = new Set([
  "lead_created",
  "lead_status_changed",
  "inbound_webhook_lead",
]);

const CAMPAIGN_ALERT_TRIGGERS = new Set([
  "ad_account_blocked",
  "ad_account_billing_issue",
  "account_stopped_spending",
  "integration_disconnected",
]);

/** The card switch an automation's trigger falls under. */
export function optInKindForAutomation(trigger: string): ClientAutoSendKind {
  if (LEAD_ALERT_TRIGGERS.has(trigger)) {
    return "lead_alert";
  }
  if (CAMPAIGN_ALERT_TRIGGERS.has(trigger)) {
    return "campaign_alert";
  }
  return "automation";
}

/**
 * The card switch target a recipient falls under. Telegram has no switch,
 * so an automatic send there needs a rule that does not ask the card.
 */
export function optInTarget(
  channel: SendChannel,
  recipient: SendRecipient,
): ClientAutoSendTarget | null {
  if (channel === "email") {
    return "email";
  }
  if (channel === "whatsapp") {
    return recipient.kind === "client_group"
      ? "whatsapp_group"
      : "whatsapp_direct";
  }
  return null;
}
