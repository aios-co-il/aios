import type { TablesUpdate } from "../../_shared/database.types.ts";
import type { UpdateDevTaskArgs } from "./developer-task-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { logDevTaskEvent } from "../../_shared/dev-tasks.ts";

/** Preserves the existing update_dev_task executor and side-effect order. */
export async function executeUpdateDevTask(
  args: UpdateDevTaskArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, actorUserId } = context;

  const id = String(args.dev_task_id || "");
  const patch: TablesUpdate<"dev_tasks"> = {
    updated_at: new Date().toISOString(),
  };
  for (const key of [
    "pr_url",
    "status",
    "priority",
    "problem",
    "acceptance_criteria",
    "title",
  ] as const) {
    if (args[key] !== undefined) {
      patch[key] = args[key];
    }
  }
  const { data, error } = await supabase
    .from("dev_tasks")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  await logDevTaskEvent(supabase, {
    devTaskId: id,
    tenantId,
    eventType: "updated",
    actorUserId,
    detail: patch,
  });
  return { task: data };
}
