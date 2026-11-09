import type { ScheduleBroadcastArgs } from "./broadcast-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing schedule_broadcast executor and side-effect order. */
export async function executeScheduleBroadcast(
  args: ScheduleBroadcastArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, agentId, actorUserId } = context;

  const { data: bc, error: bcErr } = await supabase
    .from("broadcasts")
    .select("id, name, status")
    .eq("id", args.broadcast_id)
    .eq("tenant_id", tenantId)
    .single();
  if (bcErr || !bc) {
    throw new Error("דיוור לא נמצא");
  }
  const { data: aq, error: aqErr } = await supabase
    .from("agent_approval_queue")
    .insert({
      tenant_id: tenantId,
      agent_id: agentId || null,
      requested_by: actorUserId,
      action_type: "schedule_broadcast",
      title: `תזמון דיוור: ${bc.name}`,
      description: `תזמון ל-${args.scheduled_at}`,
      tool_name: "schedule_broadcast",
      tool_input: { broadcast_id: bc.id, scheduled_at: args.scheduled_at },
      status: "pending",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (aqErr) {
    throw aqErr;
  }
  return {
    pending_approval: true,
    approval_id: aq.id,
    summary: `תזמון דיוור "${bc.name}" ל-${args.scheduled_at}.`,
    instruction_for_carmen:
      "הצג סיכום ובקש אישור. אחרי אישור — קרא ל-execute_pending_approval.",
  };
}
