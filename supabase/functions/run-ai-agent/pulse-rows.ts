import {
  type FieldCheck,
  isBoolean,
  isNamedRelation,
  isNumber,
  isString,
  matchesFields,
  nullable,
  oneOf,
  optional,
} from "./row-guards.ts";
import type {
  PulseSnapshotRow,
  RetentionPulseRow,
} from "./tool-contracts-crm.ts";

const isPulseStatus = oneOf(["healthy", "warning", "critical", "no_data"]);
const isFlags = nullable(
  (value) => Array.isArray(value) && value.every(isString),
);
const isOptionalText = optional(nullable(isString));

const BREAKDOWN_FIELDS: Record<string, FieldCheck> = {
  goal: isOptionalText,
  status: isOptionalText,
  alert_eligible: optional(nullable(isBoolean)),
  campaign_name: isOptionalText,
  client_name: isOptionalText,
  status_reason: isOptionalText,
};

const isCampaignBreakdown = optional(
  nullable(
    (value) =>
      Array.isArray(value) &&
      value.every((row) => matchesFields(row, BREAKDOWN_FIELDS)),
  ),
);

const PULSE_SNAPSHOT_FIELDS: Record<string, FieldCheck> = {
  tenant_id: isString,
  calculated_at: isString,
  data_fresh_through: nullable(isString),
  is_ecommerce: isBoolean,
  spend_7d: isNumber,
  lead_spend_7d: isNumber,
  ecommerce_spend_7d: isNumber,
  leads_7d: isNumber,
  cpl_7d: nullable(isNumber),
  cpl_change_pct: nullable(isNumber),
  purchases_7d: isNumber,
  revenue_7d: isNumber,
  roas_7d: nullable(isNumber),
  roas_change_pct: nullable(isNumber),
  source: isString,
  last_meta_change_at: nullable(isString),
  last_meta_change_type: nullable(isString),
  last_meta_change_actor: nullable(isString),
  last_meta_change_object: nullable(isString),
  meta_change_availability: nullable(isString),
  client_id: isString,
  agency_id: nullable(isString),
  status: isPulseStatus,
  campaign_goal_mode: oneOf(["leads", "ecommerce", "hybrid"]),
  lead_goal_status: nullable(isPulseStatus),
  ecommerce_goal_status: nullable(isPulseStatus),
  flags: isFlags,
  last_client_call_at: isOptionalText,
  last_client_call_by: isOptionalText,
  campaign_breakdown: isCampaignBreakdown,
  clients: isNamedRelation,
  agencies: isNamedRelation,
};

const RETENTION_PULSE_FIELDS: Record<string, FieldCheck> = {
  client_id: isString,
  status: isString,
  calculated_at: isString,
  flags: isFlags,
  last_client_call_at: isOptionalText,
};

/** Rows from the dynamic-column pulse select; the DB constraints guarantee these shapes. */
export function isPulseSnapshotRow(value: unknown): value is PulseSnapshotRow {
  return matchesFields(value, PULSE_SNAPSHOT_FIELDS);
}

export function isRetentionPulseRow(
  value: unknown,
): value is RetentionPulseRow {
  return matchesFields(value, RETENTION_PULSE_FIELDS);
}
