import type { TaskRelations } from "./taskRelations";

/** Shared task board query result consumed by its calendar and backlog views. */
export interface Task extends TaskRelations {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  priority: number;
  due_date: string | null;
  due_time: string | null;
  client_id: string | null;
  lead_id: string | null;
  agency_id: string | null;
  campaigner_id: string | null;
  sales_person_id?: string | null;
  tenant_id: string | null;
  created_by?: string | null;
  creator_name?: string | null;
  created_at?: string;
  updated_at?: string | null;
  sort_order?: number | null;
  target_date?: string | null;
  duration_minutes?: number | null;
  google_calendar_event_id?: string | null;
  recurrence_frequency?: "daily" | "weekly" | "monthly" | null;
  recurrence_interval?: number;
  recurrence_weekday?: number | null;
  recurrence_monthday?: number | null;
  recurrence_series_id?: string | null;
  recurrence_previous_task_id?: string | null;
  clients?: { name: string; agency_id?: string | null } | null;
  campaigners?: { full_name: string } | null;
  leads?: { company_name?: string | null; contact_name?: string | null } | null;
}
