/** The in-memory world the round's fakes read and write, and row builders. */
import type { Json, TablesInsert } from "../../_shared/database.types.ts";
import type { StaffAlertStatus } from "../../_shared/staff-alert/send.ts";
import type {
  DeliveryRow,
  FindingRow,
  RouteDecision,
  UpsertDrop,
} from "../findings/types.ts";
import type { MissingScope } from "../findings/store.ts";
import type { Contact } from "../recipients/contacts.ts";
import type {
  CampaignerAssignment,
  ClientInfo,
  StaffMember,
} from "../recipients/directory.ts";
import type { RoundStateRow, TenantRow } from "../state/store.ts";

export type StoredFinding = FindingRow & {
  fingerprint: string;
  routed: boolean;
  missed: number;
};

export type World = {
  now: Date;
  findings: StoredFinding[];
  deliveries: DeliveryRow[];
  state: RoundStateRow[];
  tenants: TenantRow[];
  clients: ClientInfo[];
  /** Assignments by client id. */
  assignments: Record<string, CampaignerAssignment[]>;
  staff: StaffMember[];
  /** Campaigner contacts by recipient key (PeopleDirectory.contacts). */
  contacts: Record<string, Contact>;
  heartbeats: TablesInsert<"heartbeat_logs">[];
  sent: { phone: string; message: string }[];
  decisions: RouteDecision[];
  marks: MissingScope[];
  /** Fingerprints the fake upsert refuses, with the outcome it reports. */
  refused: Record<string, UpsertDrop>;
  slots: string[];
  leased: Set<string>;
  sendStatus: StaffAlertStatus;
  failOn: string | null;
};

export const TENANT = "11111111-1111-4111-8111-111111111111";

/** An empty world at Sunday 2026-11-01 10:00 Israel time; `fields` override any part. */
export function world(fields: Partial<World> = {}): World {
  return {
    now: new Date("2026-11-01T08:00:00Z"),
    findings: [],
    deliveries: [],
    state: [],
    tenants: [
      { tenant_id: TENANT, pulse_alert_rules: null, last_run_at: null },
    ],
    clients: [],
    assignments: {},
    staff: [],
    contacts: {},
    heartbeats: [],
    sent: [],
    decisions: [],
    marks: [],
    refused: {},
    slots: [],
    leased: new Set(),
    sendStatus: "sent",
    failOn: null,
    ...fields,
  };
}

/** A finding row with defaults; `fields` override. */
export function finding(fields: Partial<StoredFinding> = {}): StoredFinding {
  return {
    id: crypto.randomUUID(),
    client_id: null,
    agency_id: null,
    kind: "no_contact",
    severity: "warning",
    short_code: 1,
    status: "open",
    owner_user_id: null,
    escalation_level: null,
    ladder_started_at: null,
    next_action_at: null,
    source_event_at: "2026-11-01T07:00:00Z",
    summary_he: "לקוח א: אין קשר 14 יום",
    evidence: {},
    fingerprint: "fp",
    routed: false,
    missed: 0,
    ...fields,
  };
}

/** A planned level-0 'now' row of TENANT; `fields` override any column. */
export function delivery(fields: Partial<DeliveryRow>): DeliveryRow {
  return {
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    finding_id: "",
    level: 0,
    recipient_key: "user:u",
    recipient_user_id: null,
    recipient_name: "דנה כהן",
    recipient_phone: "972501111111",
    channel: "manus_wa",
    slot: "now",
    status: "planned",
    not_before: "2026-10-01T00:00:00Z",
    attempted_at: null,
    message_key: null,
    provider_message_id: null,
    error: null,
    round_id: null,
    created_at: "",
    updated_at: "",
    ...fields,
  };
}

/** pulse_alert_rules with a manager block. */
export function rules(manager: { [key: string]: Json }): Json {
  return { manager };
}
