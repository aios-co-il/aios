import type { DeleteTaskArgs } from "./task-mutations.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessEntityClient } from "../../_shared/auth-helpers.ts";

/** Preserves the existing delete_task executor and side-effect order. */
export async function executeDeleteTask(
  args: DeleteTaskArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds, callerScope } = context;

  await assertCallerCanAccessEntityClient(
    supabase,
    "tasks",
    args.task_id,
    callerScope,
  );
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", args.task_id)
    .in("tenant_id", accessibleTenantIds);
  if (error) {
    throw error;
  }
  return { success: true, deleted_id: args.task_id };
}
