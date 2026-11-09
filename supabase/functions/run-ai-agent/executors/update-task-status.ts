import type { UpdateTaskStatusArgs } from "./task-mutations.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessEntityClient } from "../../_shared/auth-helpers.ts";
import { mapHumanTaskStatus } from "./task-status.ts";

/** Preserves the existing update_task_status executor and side-effect order. */
export async function executeUpdateTaskStatus(
  args: UpdateTaskStatusArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds, callerScope } = context;

  await assertCallerCanAccessEntityClient(
    supabase,
    "tasks",
    args.task_id,
    callerScope,
  );
  const status = mapHumanTaskStatus(args.status);
  const { data, error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("id", args.task_id)
    .in("tenant_id", accessibleTenantIds)
    .select("id, title, status")
    .single();
  if (error) {
    throw error;
  }
  return data;
}
