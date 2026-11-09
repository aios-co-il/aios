export type CreateTaskArgs = {
  title: string;
  client_id?: string;
  lead_id?: string;
  campaigner_id?: string;
  priority?: number;
  due_date?: string;
  due_time?: string;
  notes?: string;
  duration_minutes?: number;
};

export type CreateAgentTaskArgs = {
  agent_id?: string;
  title: string;
  description?: string;
  priority?: number;
  schedule_type?: "once" | "daily" | "weekly";
  scheduled_at?: string;
  cron_expression?: string;
  task_skills?: Array<string>;
};
