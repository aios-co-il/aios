import type { Database, Json } from "../_shared/database.types.ts";
import type {
  CampaignGoalMode,
  PulseCampaignBreakdownRow,
  PulseStatus,
} from "../_shared/campaign-pulse.ts";
import type { AgentRow } from "./database-contracts.ts";
import { z } from "npm:zod@3.25.76";

/** Output of normalizeAdCopyVariants (fb-ad-duplicate.mjs). */
export type AdCopyVariant = {
  primary_text: string;
  headline: string | null;
  description: string | null;
  name: string | null;
};

export type CampaignTableMatch =
  Database["public"]["Functions"]["find_campaign_tables"]["Returns"][number];

export type CrmDataRecord = Pick<AgentRow<"crm_records">, "data">;

type PulseSnapshotColumns = AgentRow<"campaign_pulse_snapshots">;

/**
 * Snapshot row as written by the campaign-pulse job. The generated types expose
 * the enum-like text and jsonb columns loosely; the pulse helpers rely on these.
 */
export type PulseSnapshotRow = Pick<
  PulseSnapshotColumns,
  | "tenant_id"
  | "calculated_at"
  | "data_fresh_through"
  | "is_ecommerce"
  | "spend_7d"
  | "lead_spend_7d"
  | "ecommerce_spend_7d"
  | "leads_7d"
  | "cpl_7d"
  | "cpl_change_pct"
  | "purchases_7d"
  | "revenue_7d"
  | "roas_7d"
  | "roas_change_pct"
  | "source"
  | "last_meta_change_at"
  | "last_meta_change_type"
  | "last_meta_change_actor"
  | "last_meta_change_object"
  | "meta_change_availability"
  | "client_id"
  | "agency_id"
> & {
  status: PulseStatus;
  campaign_goal_mode: CampaignGoalMode;
  lead_goal_status: PulseStatus | null;
  ecommerce_goal_status: PulseStatus | null;
  flags: string[] | null;
  last_client_call_at?: string | null;
  last_client_call_by?: string | null;
  campaign_breakdown?: PulseCampaignBreakdownRow[] | null;
  clients: { name: string } | null;
  agencies: { name: string } | null;
};

export type RetentionPulseRow = Pick<
  PulseSnapshotColumns,
  "client_id" | "status" | "calculated_at"
> & {
  flags: string[] | null;
  last_client_call_at?: string | null;
};

export type PulseManualOverride = {
  client_id: string;
  client_name: string | null;
  algorithm_status: string;
  override_status: string;
  reason: string;
  algorithm_flags: Json;
  algorithm_metrics: Json;
  corrected_at: string;
};

export type SyncedCampaignClient = {
  client_id: string;
  client_name: string;
  agency_name: string | null;
  is_ecommerce: boolean;
  spend_7d: number;
  spend_30d: number;
  leads_7d: number;
  leads_30d: number;
  cpl_7d: number | null;
  cpl_30d_avg: number | null;
  purchases_7d: number;
  purchases_30d: number;
  revenue_7d: number;
  revenue_30d: number;
  cpp_7d: number | null;
  cpp_change_pct: number | null;
  roas_7d: number | null;
  profit_7d: number;
  spend_change_pct: number | null;
  cpl_change_pct: number | null;
  last_data_date: string | null;
  last_campaign_update: string | number | null;
  days_since_last_campaign_touch: number | null;
  sync_status: "ok" | "stale_or_empty";
  alert: string | null;
};

export type CampaignStatusSummary = {
  campaign_id: Json;
  campaign_name: Json;
  status: Json;
  effective_status: Json;
  configured_status: Json;
  last_date: string | null;
};

export type BatchHealthResult = {
  client_id: unknown;
  success: boolean;
  mood_status?: unknown;
  error?: string;
};

const crmRecordDaySchema = z.object({ date: z.string().min(1) });

/** Day string of a synced insight row; non-string dates never match a day window. */
export function crmRecordDay(data: unknown): string | null {
  const parsed = crmRecordDaySchema.safeParse(data);
  return parsed.success ? parsed.data.date : null;
}

/** `name` of an embedded relation (`clients(name)`) whose select type is unresolved. */
const relationNameSchema = z.object({ name: z.unknown() }).catch({});

export function relationName(value: unknown): unknown {
  return relationNameSchema.parse(value).name;
}

/** Legacy finance row; the embedded client name is read from `clients`. */
const financeEntrySchema = z.object({ clients: z.unknown() }).passthrough();

export function financeEntries(rows: unknown[]) {
  return rows.flatMap((row) => {
    const entry = financeEntrySchema.safeParse(row);
    return entry.success
      ? [{ ...entry.data, client_name: relationName(entry.data.clients) }]
      : [];
  });
}
