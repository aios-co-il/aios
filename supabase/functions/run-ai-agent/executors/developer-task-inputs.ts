export type AssignTaskToCursorArgs = { task_id: string; notes?: string };

export type FindDevTaskDuplicatesArgs = { title: string };

export type CreateDevTaskArgs = {
  source_conversation_id?: string;
  title: string;
  problem?: string;
  expected_behavior?: string;
  current_behavior?: string;
  scope?: string;
  affected_areas?: string;
  constraints?: string;
  acceptance_criteria?: string;
  base_branch?: string;
  environment?: string;
  requested_by?: string;
  priority?: "urgent" | "high" | "normal" | "low";
  assigned_agent?: "cursor" | "grok" | "manus" | "claude";
  dedup_of?: string;
  goal_id?: string;
  source_message?: string;
};

export type ApproveDevTaskArgs = { dev_task_id: string };

export type DispatchDevTaskArgs = { dev_task_id: string };

export type ListDevTasksArgs = {
  status?: string;
  priority?: string;
  limit?: number;
};

export type UpdateDevTaskArgs = {
  title?: string;
  dev_task_id: string;
  pr_url?: string;
  status?: string;
  priority?: string;
  problem?: string;
  acceptance_criteria?: string;
};

export type AttachDevTaskSessionArgs = {
  dev_task_id: string;
  cursor_session_id: string;
  cursor_session_url?: string;
};
