import type { CompleteTaskStepArgs } from "./task-mutations.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing complete_task_step executor and side-effect order. */
export async function executeCompleteTaskStep(
  args: CompleteTaskStepArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId, accessibleTenantIds } = context;

  // Add agent_action update
  await supabase.from("task_updates").insert({
    task_id: args.task_id,
    user_id: userId,
    tenant_id: tenantId,
    content: args.step_description,
    update_type: "agent_action",
  });
  // Optionally mark as complete
  if (args.mark_complete) {
    await supabase
      .from("tasks")
      .update({ status: "done", assigned_agent: null })
      .eq("id", args.task_id)
      .in("tenant_id", accessibleTenantIds);
  }
  return {
    success: true,
    task_id: args.task_id,
    completed: !!args.mark_complete,
  };
}
