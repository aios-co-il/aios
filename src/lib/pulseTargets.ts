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
