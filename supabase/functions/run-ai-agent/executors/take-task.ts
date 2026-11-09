import type { TakeTaskArgs } from "./task-mutations.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing take_task executor and side-effect order. */
export async function executeTakeTask(
  args: TakeTaskArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId, accessibleTenantIds } = context;

  const agentName = args.agent_name || "carmen";
  const isCursor = String(agentName).toLowerCase().includes("cursor");
  const { data, error } = await supabase
    .from("tasks")
    .update({
      assigned_agent: agentName,
      status: isCursor ? "open" : "in_progress",
    })
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
    content: `הסוכן ${agentName} לקח בעלות על המשימה`,
    update_type: "agent_action",
  });
  if (isCursor) {
    fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/dispatch-cursor-tasks`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ tenant_id: tenantId }),
      },
    ).catch((e) =>
      console.warn("[take_task] dispatch-cursor-tasks:", e?.message),
    );
  }
  return { success: true, task: data };
}
