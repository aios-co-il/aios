// The vocabulary of the client send guard (AIO-261): who an automatic send
// reaches, who asked for it, and why the guard may refuse it. The web app
// imports this module for the refusal labels, so it stays free of Deno and
// browser APIs.
import type { SendKind } from "../client-card/send-kind.ts";

export type SendChannel = "whatsapp" | "email" | "telegram";

/**
 * `person`: a signed-in person picked the recipient (the call carries their
 * JWT). `system`: the service role, so a program computed the recipient.
 */
export type SendOrigin = "person" | "system";

/** What resolve_send_recipient calls an address, nearest the client first. */
export const RECIPIENT_KINDS = [
  "client",
  "client_contact",
  "client_group",
  "lead",
  "staff",
  "unknown",
] as const;

export type RecipientKind = (typeof RECIPIENT_KINDS)[number];

/** recipient_kind of a logged refusal whose address could not be resolved. */
export const UNRESOLVED_RECIPIENT = "unresolved";

export type SendRecipient = {
  kind: RecipientKind;
  /** Every client the address belongs to, across the sender's scope. */
  clientIds: string[];
  leadId: string | null;
  groupId: string | null;
  /** A WhatsApp group linked to more than one client. */
  ambiguous: boolean;
};

/** Why the guard refused a send; client_send_refusals.reason holds these. */
export const CLIENT_SEND_REFUSALS = [
  "unclassified_service_send",
  "person_only_kind",
  "staff_only",
  "proof_missing",
  "proof_invalid",
  "automation_without_ref",
  "not_opted_in",
  "no_subject",
  "subject_mismatch",
  "ambiguous_group",
  "carmen_unverified",
  "guard_error",
] as const;

export type ClientSendRefusal = (typeof CLIENT_SEND_REFUSALS)[number];

/** One send the guard decides on, built by clientSendRequest. */
export type ClientSendRequest = {
  /** The edge function that sends, for the refusal log. */
  functionName: string;
  /** The sending tenant, already checked against the caller. */
  tenantId: string;
  channel: SendChannel;
  /** What the provider gets: a chat id, phone, email or Telegram chat id. */
  address: string;
  origin: SendOrigin;
  /** The stored send_kind: null when a service-role caller named none. */
  sendKind: SendKind | null;
  sendRef: string | null;
  /** The client the content is about: the sender's clientId field. */
  subjectClientId: string | null;
};

/**
 * `observed`: a refusal that is only logged while its rule is observed
 * (OBSERVED_REFUSALS in rules.ts); the send goes out.
 */
export type ClientSendDecision =
  | {
      allowed: true;
      recipient: SendRecipient | null;
      observed: ClientSendRefusal | null;
    }
  | {
      allowed: false;
      reason: ClientSendRefusal;
      recipient: SendRecipient | null;
    };

export type ClientSendRefused = Extract<ClientSendDecision, { allowed: false }>;
