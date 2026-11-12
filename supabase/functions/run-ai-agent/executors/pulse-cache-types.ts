import type { AgentRow } from "../database-contracts.ts";
import type {
  PulseStatus,
  CampaignGoalMode,
  PulseCampaignBreakdownRow,
} from "../../_shared/campaign-pulse.ts";

type SnapshotBase = Pick<
  AgentRow<"campaign_pulse_snapshots">,
  | "tenant_id"
  | "calculated_at"
  | "data_fresh_through"
  | "status"
  | "campaign_goal_mode"
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
  | "lead_goal_status"
  | "ecommerce_goal_status"
  | "flags"
  | "source"
  | "last_meta_change_at"
  | "last_meta_change_type"
  | "last_meta_change_actor"
  | "last_meta_change_object"
  | "meta_change_availability"
  | "client_id"
  | "agency_id"
>;

export type PulseCacheRow = {
  campaign_breakdown?: Array<PulseCampaignBreakdownRow> | null;
} & Omit<
  SnapshotBase,
  | "status"
  | "campaign_goal_mode"
  | "lead_goal_status"
  | "ecommerce_goal_status"
  | "flags"
> & {
    flags: Array<string> | null;
    status: PulseStatus;
    campaign_goal_mode: CampaignGoalMode;
    lead_goal_status: PulseStatus | null;
    ecommerce_goal_status: PulseStatus | null;
    clients: { name: string } | null;
    agencies: { name: string } | null;
  } & Partial<
    Pick<
      AgentRow<"campaign_pulse_snapshots">,
      "last_client_call_at" | "last_client_call_by"
    >
  >;
