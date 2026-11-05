import type {
  PulseCampaignGoal,
  PulseCampaignGoalRow,
} from "@/lib/pulseCampaignGoals";
import { buildPulseAttentionRows as buildRows } from "../../supabase/functions/_shared/pulse-attention-matrix.mjs";
import type { PulseTarget } from "../../supabase/functions/_shared/pulse/targets/kinds.ts";

export type PulseAttentionIssueLevel = "ok" | "watch" | "alert";

export type PulseAttentionIssue = {
  level: PulseAttentionIssueLevel;
  label: string;
};

export type PulseAttentionClientContext = {
  clientId: string;
  clientName: string;
  campaignerName: string;
  moodStatus: string | null;
  lastClientCallAt: string | null;
  daysSinceLastCommunication: number | null;
  recentCommunicationStatus: "normal" | "sensitive" | "complaint" | null;
  hasRecentComplaintUpdate: boolean;
};

export type PulseAttentionRow = {
  clientId: string;
  clientName: string;
  campaignerName: string;
  platform: "meta" | "google";
  tableId: string | null;
  primaryGoal: PulseCampaignGoal;
  /** An approved target or Carmen's market estimate; never a baseline. */
  target: PulseTarget | null;
  currentEfficiency: number | null;
  /** Spend-weighted 7-day efficiency of the 28-day baseline, as a hint only. */
  baselineEfficiency7d: number | null;
  spend7d: number;
  issues: {
    campaignTouch: PulseAttentionIssue | null;
    efficiency: PulseAttentionIssue | null;
    lastCommunication: PulseAttentionIssue | null;
    complaintUpdate: PulseAttentionIssue | null;
    satisfaction: PulseAttentionIssue | null;
  };
  hasAnyIssue: boolean;
};

type PlatformTable = {
  id: string;
  client_id: string;
  integration_type: string | null;
  integration_settings?: Record<string, unknown> | null;
};

export const buildPulseAttentionRows = buildRows as (input: {
  campaignRows: PulseCampaignGoalRow[];
  tables: PlatformTable[];
  clients: PulseAttentionClientContext[];
}) => PulseAttentionRow[];
