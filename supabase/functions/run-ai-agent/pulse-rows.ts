import { z } from "npm:zod@3.25.76";
import type {
  PulseSnapshotRow,
  RetentionPulseRow,
} from "./tool-contracts-crm.ts";

const pulseStatus = z.enum(["healthy", "warning", "critical", "no_data"]);
const flags = z.array(z.string()).nullable();
const optionalText = z.string().nullish();
const namedRelation = z.object({ name: z.string() }).passthrough().nullable();

const campaignBreakdownRow = z
  .object({
    goal: optionalText,
    status: optionalText,
    alert_eligible: z.boolean().nullish(),
    campaign_name: optionalText,
    client_name: optionalText,
    status_reason: optionalText,
  })
  .passthrough();

/** Row of the dynamic-column pulse select; the DB constraints guarantee these shapes. */
const pulseSnapshotRowSchema: z.ZodType<
  PulseSnapshotRow,
  z.ZodTypeDef,
  unknown
> = z
  .object({
    tenant_id: z.string(),
    calculated_at: z.string(),
    data_fresh_through: z.string().nullable(),
    is_ecommerce: z.boolean(),
    spend_7d: z.number(),
    lead_spend_7d: z.number(),
    ecommerce_spend_7d: z.number(),
    leads_7d: z.number(),
    cpl_7d: z.number().nullable(),
    cpl_change_pct: z.number().nullable(),
    purchases_7d: z.number(),
    revenue_7d: z.number(),
    roas_7d: z.number().nullable(),
    roas_change_pct: z.number().nullable(),
    source: z.string(),
    last_meta_change_at: z.string().nullable(),
    last_meta_change_type: z.string().nullable(),
    last_meta_change_actor: z.string().nullable(),
    last_meta_change_object: z.string().nullable(),
    meta_change_availability: z.string().nullable(),
    client_id: z.string(),
    agency_id: z.string().nullable(),
    status: pulseStatus,
    campaign_goal_mode: z.enum(["leads", "ecommerce", "hybrid"]),
    lead_goal_status: pulseStatus.nullable(),
    ecommerce_goal_status: pulseStatus.nullable(),
    flags,
    last_client_call_at: optionalText,
    last_client_call_by: optionalText,
    campaign_breakdown: z.array(campaignBreakdownRow).nullish(),
    clients: namedRelation,
    agencies: namedRelation,
  })
  .passthrough();

const retentionPulseRowSchema: z.ZodType<
  RetentionPulseRow,
  z.ZodTypeDef,
  unknown
> = z
  .object({
    client_id: z.string(),
    status: z.string(),
    calculated_at: z.string(),
    flags,
    last_client_call_at: optionalText,
  })
  .passthrough();

function validRows<Row>(
  schema: z.ZodType<Row, z.ZodTypeDef, unknown>,
  rows: unknown[],
): Row[] {
  return rows.flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Pulse rows that match the snapshot shape; malformed rows are skipped. */
export function pulseSnapshotRows(rows: unknown[]): PulseSnapshotRow[] {
  return validRows(pulseSnapshotRowSchema, rows);
}

export function retentionPulseRows(rows: unknown[]): RetentionPulseRow[] {
  return validRows(retentionPulseRowSchema, rows);
}
