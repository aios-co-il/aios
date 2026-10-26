// Pulse targets and the cost rules for campaigns without one (AIO-236).
// The rules are plain ESM shared with the Edge snapshot, so the dashboard and the
// WhatsApp alerts read targets and thresholds the same way.
import type {
  PulseCampaignGoal,
  PulseCampaignGoalRow,
} from "@/lib/pulseCampaignGoals";
import {
  buildPulseTargetPatch as buildPatch,
  listCampaignsWithoutTarget as listWithoutTarget,
  pulseTargetKindLabel as kindLabel,
  pulseTargetKindsForGoal as kindsForGoal,
  pulseTargetSourceLabel as sourceLabel,
  resolvePulseTarget as resolveTarget,
  resolvePulseTargetAcross as resolveTargetAcross,
} from "../../supabase/functions/_shared/pulse-targets.mjs";
import {
  PULSE_COST_RULE_DEFAULTS as COST_DEFAULTS,
  resolvePulseCostRules as resolveCostRules,
} from "../../supabase/functions/_shared/pulse-cost-rules.mjs";

export type PulseTargetKind = "cpl" | "roas" | "cpa" | "cost_per_result";
export type PulseTargetSource = "approved" | "carmen_market";

export type PulseTarget = {
  value: number;
  kind: PulseTargetKind;
  direction: "minimum" | "maximum";
  source: PulseTargetSource;
  scope: "campaign" | "platform" | "default" | "table";
  rationale: string | null;
  set_at: string | null;
  set_by: string | null;
};

export type PulseCostRules = {
  trend_pct: number;
  roas_drop_pct: number;
  min_spend_7d: number;
  min_baseline_outcomes: number;
  min_baseline_days: number;
  watch_pct: number;
  target_less_alerts: boolean;
};

export type CampaignWithoutTarget = {
  campaign_key: string;
  campaign_id: string | null;
  campaign_name: string;
  table_id: string;
  goal: PulseCampaignGoal;
  spend_7d: number;
  efficiency_7d: number | null;
};

export type PlatformWithoutTarget = {
  client_id: string;
  platform: "meta" | "google";
  spend_7d: number;
  campaigns: CampaignWithoutTarget[];
};

type TableWithSettings = {
  id: string;
  client_id: string;
  integration_settings?: Record<string, unknown> | null;
};

export const resolvePulseTarget = resolveTarget as (
  settings: Record<string, unknown> | null | undefined,
  goal: PulseCampaignGoal,
  campaign?: {
    campaignId?: string | null;
    campaignName?: string | null;
  } | null,
) => PulseTarget | null;

/** One campaign (or platform goal) read from several report tables. */
export const resolvePulseTargetAcross = resolveTargetAcross as (
  places: Array<{
    tableId?: string | null;
    settings: Record<string, unknown> | null | undefined;
    campaignId?: string | null;
    campaignName?: string | null;
  }>,
  goal: PulseCampaignGoal,
) =>
  | (PulseTarget & {
      table_id: string | null;
      campaign_id: string | null;
    })
  | null;

const SCOPE_ORDER: Record<PulseTarget["scope"], number> = {
  campaign: 0,
  platform: 1,
  default: 2,
  table: 3,
};

export type CampaignRowTarget = {
  target: PulseTarget | null;
  /** Where a campaign-level target is stored, so saving replaces that entry. */
  tableId: string;
  campaignId: string | null;
};

/**
 * The target that applies to a pulse row, and where to save over it. The row's own
 * target was resolved over every table the campaign is read from (duplicate report
 * tables); the row's table is read again too, so a save shows before the rows are
 * rebuilt. Same order as the pulse: approved first, then the most specific level.
 */
export function campaignRowTarget(
  row: PulseCampaignGoalRow,
  tableSettingsById: Map<string, Record<string, unknown>>,
): CampaignRowTarget {
  const here = { tableId: row.table_id, campaignId: row.campaign_id };
  const fresh = resolvePulseTarget(
    tableSettingsById.get(row.table_id) ?? {},
    row.goal,
    { campaignId: row.campaign_id, campaignName: row.campaign_name },
  );
  const value = row.target_value;
  const kind = row.target_kind as PulseTargetKind | null;
  const fromRow: PulseTarget | null =
    value === null || value === undefined || !kind
      ? null
      : {
          value,
          kind,
          direction: kind === "roas" ? "minimum" : "maximum",
          source:
            row.target_source === "carmen_market"
              ? "carmen_market"
              : "approved",
          scope: row.target_scope ?? "campaign",
          rationale: row.target_rationale ?? null,
          set_at: null,
          set_by: null,
        };
  const rowWins =
    fromRow &&
    (!fresh ||
      Number(fromRow.source !== "approved") -
        Number(fresh.source !== "approved") <
        0 ||
      (fromRow.source === fresh.source &&
        SCOPE_ORDER[fromRow.scope] < SCOPE_ORDER[fresh.scope]));
  if (!rowWins) return { target: fresh, ...here };
  return fromRow.scope === "campaign" && row.target_table_id
    ? {
        target: fromRow,
        tableId: row.target_table_id,
        campaignId: row.target_campaign_id ?? row.campaign_id,
      }
    : { target: fromRow, ...here };
}

export const buildPulseTargetPatch = buildPatch as (
  existingSettings: Record<string, unknown>,
  input: {
    goal: PulseCampaignGoal;
    value: number | null;
    kind?: PulseTargetKind | null;
    source?: PulseTargetSource;
    campaignId?: string | null;
    campaignName?: string | null;
    rationale?: string | null;
    setBy?: string | null;
    approvedBy?: string | null;
    setAt?: string | null;
  },
) => Record<string, unknown>;

export const listCampaignsWithoutTarget = listWithoutTarget as (input: {
  campaignRows: PulseCampaignGoalRow[];
  tables: TableWithSettings[];
}) => PlatformWithoutTarget[];

export const pulseTargetSourceLabel = sourceLabel as (
  source: PulseTargetSource | string | null | undefined,
) => string;

export const pulseTargetKindLabel = kindLabel as (
  kind: PulseTargetKind | string | null | undefined,
) => string;

export const pulseTargetKindsForGoal = kindsForGoal as (
  goal: PulseCampaignGoal,
) => PulseTargetKind[];

export const PULSE_COST_RULE_DEFAULTS = COST_DEFAULTS as PulseCostRules;

export const resolvePulseCostRules = resolveCostRules as (
  pulseAlertRules: unknown,
) => PulseCostRules;
