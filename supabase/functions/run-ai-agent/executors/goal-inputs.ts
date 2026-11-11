import type { UnifiedGoalCreateArgs } from "../../_shared/goal-execution.ts";
export type CreateGoalArgs = {
  title: string;
  description?: string;
  parent_goal_id?: string;
  due_date?: string;
  owner_type?: "agent" | "campaigner";
  owner_id?: string;
};

export type ListGoalsArgs = { status?: string; limit?: number };

export type FindExecutionGoalDuplicatesArgs = { title: string };

export type CreateExecutionGoalArgs = {
  constraints?: UnifiedGoalCreateArgs["constraints"];
  scope?: UnifiedGoalCreateArgs["scope"];
  title: string;
  description?: string;
  due_date?: string;
  priority?: "urgent" | "high" | "normal" | "low";
  completion_criteria?: string;
  next_action?: string;
  autonomous?: boolean;
  objective?: string;
  risk_level?:
    "READ" | "SAFE_WRITE" | "REVERSIBLE" | "PRODUCTION" | "DESTRUCTIVE";
  success_criteria?: Array<{
    key?: string;
    description: string;
    required?: boolean;
  }>;
  milestones?: Array<{
    title: string;
    description?: string;
    due_date?: string;
  }>;
};

export type GetExecutionGoalReportArgs = {
  goal_id: string;
  since_hours?: number;
};

export type AddGoalMilestoneArgs = {
  goal_id: string;
  title: string;
  description?: string;
  due_date?: string;
};

export type AddGoalBlockerArgs = {
  goal_id: string;
  title: string;
  description?: string;
};

export type LinkTaskToExecutionGoalArgs = { goal_id: string; task_id: string };

export type GetAutonomousGoalStatusArgs = { goal_id: string };
