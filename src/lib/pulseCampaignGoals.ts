// One deterministic pulse is shared by the dashboard and the Edge snapshot.
// The implementation is plain ESM so Deno and Vite execute identical rules;
// each campaign's goal, results and status come from _shared/campaign-goal/.
import {
  buildPulseCampaignRows as buildRows,
  dedupePulseCampaignRows as dedupeRows,
  pulseTrendWindows as trendWindows,
} from "../../supabase/functions/_shared/pulse-campaign-goals.mjs";
import type { CampaignDeliveryStatus } from "../../supabase/functions/_shared/campaign-goal/delivery-status.ts";
import type {
  PulseTargetScope,
  PulseTargetSource,
} from "../../supabase/functions/_shared/pulse/targets/kinds.ts";

export {
  campaignDeliveryStatusLabel,
  resolveCampaignDeliveryStatus,
} from "../../supabase/functions/_shared/campaign-goal/delivery-status.ts";
export { isEcommerceReportTable } from "../../supabase/functions/_shared/campaign-goal/table-goal.ts";

export type PulseCampaignGoal =
  "leads" | "engagement" | "ecommerce" | "unknown";

export type PulseCampaignGoalRow = {
  campaign_key: string;
  campaign_id: string | null;
  campaign_name: string;
  client_id: string;
  table_id: string;
  platform: "meta" | "google";
  goal: PulseCampaignGoal;
  delivery_status?: CampaignDeliveryStatus;
  classification_source:
    "explicit_mapping" | "platform_goal" | "table_report_type" | "unclassified";
  campaign_objective?: string | null;
  optimization_goal?: string | null;
  campaign_type_hint?: string | null;
  result_kind?: string | null;
  outcome_kind: string | null;
  status: "healthy" | "warning" | "critical" | "no_data";
  status_tier:
    "normal" | "watch" | "exception" | "missing_data" | "needs_classification";
  status_reason: string;
  alert_eligible: boolean;
  /** The client's full days without results before the exception (clients.pulse_no_results_days); older snapshots lack it. */
  no_results_days?: number;
  target_value: number | null;
  target_kind: string | null;
  target_source?: PulseTargetSource | null;
  target_scope?: PulseTargetScope | null;
  /** The table that holds the target (a duplicate report table may hold it). */
  target_table_id?: string | null;
  /** The campaign id that table stores a campaign-level target under. */
  target_campaign_id?: string | null;
  /** Carmen's reasoning for a market target. */
  target_rationale?: string | null;
  /** Every report table the campaign is read from; its target is resolved over these. */
  read_table_ids?: Array<string>;
  spend_3d: number;
  outcomes_3d: number | null;
  efficiency_3d: number | null;
  spend_7d: number;
  outcomes_7d: number | null;
  revenue_7d: number;
  efficiency_7d: number | null;
  baseline_efficiency_3d: number | null;
  baseline_efficiency_7d: number | null;
  /** Real outcomes and spending days in the 28-day baseline (target-less guards). */
  baseline_outcomes?: number | null;
  baseline_days?: number;
  trend_3d_pct: number | null;
  trend_7d_pct: number | null;
  impressions_7d: number;
  /**
   * Link clicks (all clicks on rows without them) over the last 7 full days.
   * This and the two below are absent on snapshots stored before they existed.
   */
  clicks_7d?: number;
  /** Clicks per 100 impressions; null without impressions. */
  ctr_7d?: number | null;
  /** Ad-attributed Page and Instagram follows; null when no row carries a count. */
  new_followers_7d?: number | null;
  reach_7d: number;
  frequency_7d: number | null;
  spend_today: number;
  outcomes_today: number | null;
  revenue_today: number;
  efficiency_today: number | null;
  data_fresh_through: string | null;
  last_change_at: string | null;
  last_sync_at: string | null;
  partial_today_excluded: boolean;
  today_partial_included: boolean;
};

export const dedupePulseCampaignRows = dedupeRows as (
  rows: Array<PulseCampaignGoalRow>,
) => Array<PulseCampaignGoalRow>;

export const buildPulseCampaignRows = buildRows as (input: {
  records: Array<{ table_id: string; data?: Record<string, unknown> | null }>;
  tables: Array<{
    id: string;
    client_id: string;
    integration_type?: string | null;
    category?: string | null;
    integration_settings?: Record<string, unknown> | null;
  }>;
  nowYmd: string;
  /** tenant_heartbeat_settings.pulse_alert_rules — same value the snapshot uses. */
  alertRules?: unknown;
  /** Each client's clients.pulse_no_results_days, by client id; missing means 7. */
  noResultsDaysByClient?: Record<string, number | null | undefined>;
}) => Array<PulseCampaignGoalRow>;

export const pulseTrendWindows = trendWindows;
