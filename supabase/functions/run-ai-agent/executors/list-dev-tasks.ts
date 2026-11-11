import type { ListDevTasksArgs } from "./developer-task-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing list_dev_tasks executor and side-effect order. */
export async function executeListDevTasks(
  args: ListDevTasksArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  let q = supabase
    .from("dev_tasks")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });
  if (args.status) {
    q = q.eq("status", args.status);
  }
  if (args.priority) {
    q = q.eq("priority", args.priority);
  }
  const limit = Math.min(Number(args.limit) || 30, 80);
  const { data, error } = await q.limit(limit);
  if (error) {
    throw error;
  }
  return { count: data?.length || 0, tasks: data || [] };
}
