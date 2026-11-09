import type { TablesUpdate } from "../../_shared/database.types.ts";
import type { AssignTaskToCursorArgs } from "./developer-task-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { errorMessage } from "../error-message.ts";

/** Preserves the existing assign_task_to_cursor executor and side-effect order. */
export async function executeAssignTaskToCursor(
  args: AssignTaskToCursorArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId, accessibleTenantIds } = context;

  const patch: TablesUpdate<"tasks"> = {
    assigned_agent: "Cursor",
    status: "open",
  };
  if (args.notes) {
    patch.notes = String(args.notes);
  }
  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", args.task_id)
    .in("tenant_id", accessibleTenantIds)
    .select("id, title, status, assigned_agent")
    .single();
  if (error) {
    throw error;
  }
  await supabase.from("task_updates").insert({
    task_id: args.task_id,
    user_id: userId,
    tenant_id: tenantId,
    content: "המשימה הוקצתה ל-Cursor — תור dispatch אוטומטי",
    update_type: "agent_action",
  });
  let dispatched: unknown = null;
  try {
    const resp = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/dispatch-cursor-tasks`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ tenant_id: tenantId }),
      },
    );
    dispatched = await resp.json();
  } catch (e) {
    console.warn("[assign_task_to_cursor] dispatch failed:", errorMessage(e));
  }
  return { success: true, task: data, dispatch: dispatched };
}
