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

export type DeliveryStatus =
  | "planned"
  | "sent"
  | "delivery_unknown"
  | "blocked_staging"
  | "duplicate_skipped"
  | "failed"
  | "no_phone"
  | "no_line"
  | "no_sender"
  | "cancelled";

export type UpsertOutcome = {
  finding_id: string | null;
  kind: string;
  fingerprint: string;
  short_code: number | null;
  outcome: string;
};

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

/** Reads `evidence.alert_type`, the Shabbat-critical marker (_shared/shabbat/critical-alerts.ts). */
export function alertTypeOf(evidence: Json): string | null {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return null;
  }
  const value = evidence.alert_type;
  return typeof value === "string" ? value : null;
}
