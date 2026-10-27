/** Rows and routing shapes shared by the round's steps. */
import type { Json, Tables } from "../../_shared/database.types.ts";

export type FindingRow = Pick<
  Tables<"carmen_findings">,
  | "id"
  | "client_id"
  | "agency_id"
  | "kind"
  | "severity"
  | "short_code"
  | "status"
  | "owner_user_id"
  | "escalation_level"
  | "ladder_started_at"
  | "next_action_at"
  | "source_event_at"
  | "summary_he"
  | "evidence"
>;

export const FINDING_COLUMNS =
  "id, client_id, agency_id, kind, severity, short_code, status, owner_user_id, escalation_level, ladder_started_at, next_action_at, source_event_at, summary_he, evidence";

export type DeliveryRow = Tables<"carmen_finding_deliveries">;

/** carmen_finding_deliveries.status CHECK values (types.test.ts pins them to the migration). */
export const DELIVERY_STATUSES = [
  "planned",
  "claimed",
  "sent",
  "delivery_unknown",
  "blocked_staging",
  "duplicate_skipped",
  "failed",
  "no_phone",
  "no_line",
  "no_sender",
  "cancelled",
  "expired",
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** Statuses of a message that went out or may have: carmen_delivery_went_out in the migration. */
export const DELIVERED_STATUSES = [
  "sent",
  "delivery_unknown",
] as const satisfies readonly DeliveryStatus[];

/** True when a delivery with this status went out or may have. */
export function wentOut(status: string): boolean {
  return DELIVERED_STATUSES.some((delivered) => delivered === status);
}

/** carmen_finding_upsert outcomes that stored the candidate. */
export const UPSERT_STORED = ["inserted", "seen", "worsened"] as const;

/** carmen_finding_upsert outcomes of a candidate it did not store (it raises a NOTICE for them). */
export const UPSERT_DROPPED = [
  "invalid",
  "duplicate",
  "rejected_client",
  "rejected_agency",
  "suppressed",
  "conflict",
] as const;

export type UpsertDrop = (typeof UPSERT_DROPPED)[number];

export type UpsertOutcome = {
  finding_id: string | null;
  kind: string;
  fingerprint: string;
  short_code: number | null;
  outcome: (typeof UPSERT_STORED)[number] | UpsertDrop;
};

/** Narrows a carmen_finding_upsert outcome to the known ones. */
export function isUpsertOutcome(
  value: string,
): value is UpsertOutcome["outcome"] {
  return [...UPSERT_STORED, ...UPSERT_DROPPED].some(
    (outcome) => outcome === value,
  );
}

export type RecipientRole = "campaigner" | "manager" | "owner";

export type Recipient = {
  /** `user:<id>`, or `campaigner:<id>` for a campaigner without a login. */
  key: string;
  user_id: string | null;
  name: string;
  /** Normalised digits, or null when the person has no usable phone. */
  phone: string | null;
  role: RecipientRole;
};

export type Level = 0 | 1 | 2;

/** What the round did or would do with a finding (shown in observe mode). */
export type PlannedAction = {
  level: Level;
  action: "notify" | "brief" | "hold";
  to: string[];
  at: string | null;
  reason?: string;
};

export type PlannedDelivery = {
  level: Level;
  recipient_key: string;
  recipient_user_id: string | null;
  recipient_name: string;
  recipient_phone: string | null;
  channel: "manus_wa" | "in_app";
  slot: "now" | "list";
  status: "planned" | "no_phone";
  not_before: string;
};

export type RouteDecision = {
  finding_id: string;
  status: "notified" | null;
  escalation_level: number | null;
  ladder_started_at: string | null;
  next_action_at: string | null;
  owner_user_id: string | null;
  /** null keeps the actions already recorded on the finding. */
  planned_actions: PlannedAction[] | null;
  deliveries: PlannedDelivery[];
};

/**
 * A string field of a finding's evidence, or null; `alert_type` is the
 * Shabbat-critical marker (_shared/shabbat/critical-alerts.ts).
 */
export function evidenceText(evidence: Json, field: string): string | null {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return null;
  }
  const value = evidence[field];
  return typeof value === "string" ? value : null;
}

/** Each recipient once, first occurrence kept. */
export function uniqueByKey(recipients: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  return recipients.filter(
    (recipient) => !seen.has(recipient.key) && !!seen.add(recipient.key),
  );
}
