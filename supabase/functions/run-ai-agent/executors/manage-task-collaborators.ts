import type { ManageTaskCollaboratorsArgs } from "./task-mutations.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { fireTaskPeerNotification } from "../../_shared/notify-task-peers.ts";

/** Preserves the existing manage_task_collaborators executor and side-effect order. */
export async function executeManageTaskCollaborators(
  args: ManageTaskCollaboratorsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, userId, accessibleTenantIds, SUPABASE_URL } = context;

  if (args.action === "add") {
    const { data: taskRow, error: taskErr } = await supabase
      .from("tasks")
      .select("tenant_id")
      .eq("id", args.task_id)
      .in("tenant_id", accessibleTenantIds)
      .maybeSingle();
    if (taskErr) {
      throw taskErr;
    }
    if (!taskRow?.tenant_id) {
      throw new Error("משימה לא נמצאה");
    }
    const { data, error } = await supabase
      .from("task_collaborators")
      .insert({
        task_id: args.task_id,
        campaigner_id: args.campaigner_id,
        tenant_id: taskRow.tenant_id,
      })
      .select("id")
      .single();
    if (error) {
      throw error;
    }
    void fireTaskPeerNotification({
      supabaseUrl: SUPABASE_URL,
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string,
      triggerType: "task_collaborator_added",
      data: {
        task_id: args.task_id,
        notify_campaigner_id: args.campaigner_id,
        user_id: userId,
      },
    });
    return { success: true, action: "added", collaborator_id: data.id };
  } else {
    const { error } = await supabase
      .from("task_collaborators")
      .delete()
      .eq("task_id", args.task_id)
      .eq("campaigner_id", args.campaigner_id)
      .in("tenant_id", accessibleTenantIds);
    if (error) {
      throw error;
    }
    return { success: true, action: "removed" };
  }
}
