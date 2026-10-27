/**
 * Routing gaps as findings for the owner: a client with no active campaigner
 * (no_campaigner) and a person Carmen cannot message (missing_phone). Raised
 * and cleared by the router itself, from what it resolved this run.
 */
import type { FindingCandidate } from "../collectors/types.ts";
import type { Recipient } from "../findings/types.ts";
import type { ClientInfo } from "./directory.ts";

/** Collector id these findings are stored under. */
export const ROUTER_COLLECTOR = { id: "router", detectorVersion: "1" };

/** Kinds the router raises itself. */
export const ROUTER_KINDS = ["no_campaigner", "missing_phone"] as const;

/** A client the router found without an active campaigner. */
export function noCampaignerFinding(
  client: ClientInfo,
  now: Date,
): FindingCandidate {
  return {
    kind: "no_campaigner",
    fingerprint: `client:${client.id}`,
    severity: "warning",
    client_id: client.id,
    agency_id: client.agency_id,
    source_event_at: now.toISOString(),
    summary_he: `${client.name}: אין קמפיינר פעיל משויך ללקוח, ולכן ההתראות עליו עוברות ישר למנהל`,
    evidence: { client_id: client.id },
    owner_user_id: null,
  };
}

/** A person the router could not message for lack of a phone. */
export function missingPhoneFinding(
  recipient: Recipient,
  now: Date,
): FindingCandidate {
  return {
    kind: "missing_phone",
    fingerprint: `person:${recipient.key}`,
    severity: "warning",
    client_id: null,
    agency_id: null,
    source_event_at: now.toISOString(),
    summary_he: `אין מספר WhatsApp תקין עבור ${recipient.name || "איש צוות"}, ולכן ההודעות של כרמן מוצגות רק במערכת`,
    evidence: { recipient_key: recipient.key, role: recipient.role },
    owner_user_id: recipient.user_id,
  };
}
