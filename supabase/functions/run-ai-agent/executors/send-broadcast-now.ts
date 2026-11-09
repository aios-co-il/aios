import type { SendBroadcastNowArgs } from "./broadcast-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing send_broadcast_now executor and side-effect order. */
export async function executeSendBroadcastNow(
  args: SendBroadcastNowArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, agentId, actorUserId } = context;

  const { data: bc, error: bcErr } = await supabase
    .from("broadcasts")
    .select("id, name, status, tenant_id")
    .eq("id", args.broadcast_id)
    .eq("tenant_id", tenantId)
    .single();
  if (bcErr || !bc) {
    throw new Error("דיוור לא נמצא");
  }
  if (!["draft", "scheduled"].includes(bc.status)) {
    throw new Error(`אי אפשר לשלוח דיוור בסטטוס ${bc.status}`);
  }
  const { data: aq, error: aqErr } = await supabase
    .from("agent_approval_queue")
    .insert({
      tenant_id: tenantId,
      agent_id: agentId || null,
      requested_by: actorUserId,
      action_type: "send_broadcast_now",
      title: `שליחת דיוור: ${bc.name}`,
      description: "שליחת דיוור WhatsApp מיידית",
      tool_name: "send_broadcast_now",
      tool_input: { broadcast_id: bc.id },
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
    summary: `שליחת דיוור "${bc.name}" מיידית לכל הנמענים.`,
    instruction_for_carmen:
      "הצג סיכום ובקש אישור. אחרי אישור — קרא ל-execute_pending_approval.",
  };
}
