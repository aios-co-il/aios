import { z } from "zod";
import type { Tables } from "@/integrations/supabase/types";

const prioritySchema = z.enum(["high", "medium", "low"]);
const statusSchema = z.enum(["active", "paused", "done"]);

export type AgentGoalPriority = z.infer<typeof prioritySchema>;
export type AgentGoalStatus = z.infer<typeof statusSchema>;

export type AgentGoal = Omit<Tables<"agent_goals">, "priority" | "status"> & {
  priority: AgentGoalPriority;
  status: AgentGoalStatus;
};

/** Unknown priority/status values fall back to the column defaults. */
export function toAgentGoal(row: Tables<"agent_goals">): AgentGoal {
  return {
    ...row,
    priority: prioritySchema.catch("medium").parse(row.priority),
    status: statusSchema.catch("active").parse(row.status),
  };
}
