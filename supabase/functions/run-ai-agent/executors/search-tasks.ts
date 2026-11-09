import type { SearchTasksArgs } from "./task-queries.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing search_tasks executor and side-effect order. */
export async function executeSearchTasks(
  args: SearchTasksArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  let query = supabase
    .from("tasks")
    .select(
      "id, title, status, priority, due_date, due_time, notes, duration_minutes, clients(name), leads(company_name), campaigners(full_name)",
    )
    .in("tenant_id", accessibleTenantIds)
    .ilike("title", `%${args.search_term}%`)
    .order("created_at", { ascending: false })
    .limit(10);
  if (args.status) {
    query = query.eq("status", args.status);
  }
  if (args.client_id) {
    query = query.eq("client_id", args.client_id);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return {
    count: data.length,
    tasks: data.map((t) => ({
      ...t,
      client_name: t.clients?.name,
      lead_name: t.leads?.company_name,
      campaigner_name: t.campaigners?.full_name,
    })),
  };
}
