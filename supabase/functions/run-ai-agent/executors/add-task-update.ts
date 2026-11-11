import type { AddTaskUpdateArgs } from "./task-mutations.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessEntityClient } from "../../_shared/auth-helpers.ts";
import { fireTaskPeerNotification } from "../../_shared/notify-task-peers.ts";

/** Preserves the existing add_task_update executor and side-effect order. */
export async function executeAddTaskUpdate(
  args: AddTaskUpdateArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId, callerScope, SUPABASE_URL } = context;

  await assertCallerCanAccessEntityClient(
    supabase,
    "tasks",
    args.task_id,
    callerScope,
  );
  const { data, error } = await supabase
    .from("task_updates")
    .insert({
      task_id: args.task_id,
      user_id: userId,
      tenant_id: tenantId,
      content: args.content,
    })
    .select("id")
    .single();
  if (error) {
    throw error;
  }
  void fireTaskPeerNotification({
    supabaseUrl: SUPABASE_URL,
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string,
    triggerType: "task_update_added",
    data: {
      task_id: args.task_id,
      user_id: userId,
      update_content: args.content,
    },
  });
  return { update_id: data.id };
}
