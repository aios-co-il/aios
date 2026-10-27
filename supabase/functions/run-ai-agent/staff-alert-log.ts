import type { DbClient } from "../_shared/supabase-clients.ts";
import { asUuidOrNull } from "../_shared/uuid.ts";
import type { StaffAlertResult } from "../_shared/staff-alert/send.ts";

/** Records the outcome of a staff alert in agent_action_log. Never throws: a failed write is logged and the tool result still returns. */
export async function logStaffAlertOutcome(
  supabase: Pick<DbClient, "from">,
  args: {
    tenantId: string;
    agentId?: string | null;
    userId?: string | null;
    conversationId?: string | null;
    recipient?: {
      entity_type?: string | null;
      id?: string | null;
      full_name?: string | null;
    } | null;
    result: StaffAlertResult;
  },
): Promise<void> {
  const r = args.result;
  try {
    const { error } = await supabase.from("agent_action_log").insert({
      tenant_id: args.tenantId,
      agent_id: asUuidOrNull(args.agentId),
      user_id: asUuidOrNull(args.userId),
      conversation_id: asUuidOrNull(args.conversationId),
      action_type: "staff_whatsapp_alert",
      status: actionStatus(r),
      error_message: r.sent ? null : r.error,
      action_details: {
        recipient_type: args.recipient?.entity_type ?? null,
        recipient_id: args.recipient?.id ?? null,
        recipient_name: args.recipient?.full_name ?? null,
        phone: r.phone,
        delivery_status: r.status,
        transport: r.transport,
        integration_id: r.integrationId,
        provider_message_id: r.providerMessageId,
      },
    });
    if (error) {
      console.warn("[staff-alert] action log insert failed", error.message);
    }
  } catch (e) {
    console.warn(
      "[staff-alert] action log insert threw",
      e instanceof Error ? e.message : String(e),
    );
  }
}

/** agent_action_log.status for a staff alert outcome. */
function actionStatus(r: StaffAlertResult): string {
  if (r.status === "sent") {
    return "success";
  }
  return r.status === "delivery_unknown" ? "delivery_unknown" : "error";
}
