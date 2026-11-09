export type UpdateTaskStatusArgs = {
  task_id: string;
  status: "open" | "in_progress" | "done" | "completed";
};

export type UpdateTaskArgs = {
  task_id: string;
  title?: string;
  due_date?: string;
  due_time?: string;
  priority?: number;
  notes?: string;
  client_id?: string;
  lead_id?: string;
  campaigner_id?: string;
  duration_minutes?: number;
  status?: "open" | "in_progress" | "done" | "completed";
};

export type DeleteTaskArgs = { task_id: string };

export type AddTaskUpdateArgs = { task_id: string; content: string };

export type ManageTaskCollaboratorsArgs = {
  task_id: string;
  campaigner_id: string;
  action: "add" | "remove";
};

export type TakeTaskArgs = { task_id: string; agent_name?: string };

export type CompleteTaskStepArgs = {
  task_id: string;
  step_description: string;
  mark_complete?: boolean;
};

export type PrioritizeTasksArgs = { limit?: number };
