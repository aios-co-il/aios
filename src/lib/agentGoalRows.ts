import type { Tables } from "@/integrations/supabase/types";

const PRIORITIES = ["high", "medium", "low"] as const;
const STATUSES = ["active", "paused", "done"] as const;

export type AgentGoalPriority = (typeof PRIORITIES)[number];
export type AgentGoalStatus = (typeof STATUSES)[number];

export type AgentGoal = Omit<Tables<"agent_goals">, "priority" | "status"> & {
  priority: AgentGoalPriority;
  status: AgentGoalStatus;
};

function isPriority(value: string): value is AgentGoalPriority {
  return PRIORITIES.some((p) => p === value);
}

function isStatus(value: string): value is AgentGoalStatus {
  return STATUSES.some((s) => s === value);
}

/** Unknown priority/status values fall back to the column defaults. */
export function toAgentGoal(row: Tables<"agent_goals">): AgentGoal {
  return {
    ...row,
    priority: isPriority(row.priority) ? row.priority : "medium",
    status: isStatus(row.status) ? row.status : "active",
  };
}
