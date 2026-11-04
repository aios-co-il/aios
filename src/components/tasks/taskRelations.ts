/** PostgREST counts and legacy relation rows accepted by task views. */
export interface TaskRelations {
  task_updates?: Array<{ id?: string; count?: number }>;
  task_collaborators?: Array<{
    id?: string;
    campaigner_id?: string;
    count?: number;
  }>;
}
