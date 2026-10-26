// Types for pulse-targets.mjs (plain ESM shared by Deno and the Vite app).

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

type CampaignRef = {
  campaignId?: string | null;
  campaignName?: string | null;
} | null;

type TableLike = {
  id: string;
  client_id: string;
  integration_type?: string | null;
  integration_settings?: Record<string, unknown> | null;
};

export const PULSE_TARGET_SOURCES: readonly PulseTargetSource[];

export function normalizeTargetSource(raw: unknown): PulseTargetSource;
export function pulseTargetSourceLabel(source: unknown): string;
export function pulseTargetKindsForGoal(goal: string): PulseTargetKind[];
export function pulseTargetKindLabel(kind: unknown): string;

export function resolvePulseTarget(
  settings: Record<string, unknown> | null | undefined,
  goal: string,
  campaign?: CampaignRef,
): PulseTarget | null;

export type PulseTargetPlace = {
  tableId?: string | null;
  settings: Record<string, unknown> | null | undefined;
  campaignId?: string | null;
  campaignName?: string | null;
};

export function resolvePulseTargetAcross(
  places: PulseTargetPlace[],
  goal: string,
):
  | (PulseTarget & {
      table_id: string | null;
      campaign_id: string | null;
    })
  | null;

export function buildPulseTargetPatch(
  existingSettings: Record<string, unknown> | null | undefined,
  input: {
    goal: string;
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
): Record<string, unknown>;

export function canSetMarketTarget(
  settings: Record<string, unknown> | null | undefined,
  goal: string,
  campaign?: CampaignRef,
): {
  ok: boolean;
  reason: "unsupported_goal" | "approved_target_exists" | null;
  existing: PulseTarget | null;
};

export type CampaignWithoutTarget = {
  campaign_key: string;
  campaign_id: string | null;
  campaign_name: string;
  table_id: string;
  goal: string;
  spend_7d: number;
  efficiency_7d: number | null;
};

export type PlatformWithoutTarget = {
  client_id: string;
  platform: "meta" | "google";
  spend_7d: number;
  campaigns: CampaignWithoutTarget[];
};

export function listCampaignsWithoutTarget(input: {
  campaignRows: Array<Record<string, any>>;
  tables: TableLike[];
}): PlatformWithoutTarget[];

export function summarizePulseTargets(input: {
  tables: TableLike[];
  campaignRows: Array<Record<string, any>>;
}): {
  clients: Array<{
    client_id: string;
    platform_targets: Array<
      PulseTarget & { table_id: string; platform: string; goal: string }
    >;
    campaign_targets: Array<
      PulseTarget & {
        table_id: string;
        platform: string;
        campaign: string;
        goal: string;
      }
    >;
    missing: PlatformWithoutTarget[];
  }>;
  missing_count: number;
};
