import type { DbClient } from "../_shared/supabase-clients.ts";
import { sendStaffAlert } from "../_shared/staff-alert/send.ts";
import { logStaffAlertOutcome } from "./staff-alert-log.ts";
import {
  staffAlertToolResult,
  type StaffAlertToolResult,
} from "./staff-alert-tool-result.ts";

/**
 * The send_whatsapp_to_staff / send_message_to_campaigner tool: send from
 * Carmen's primary Manus line (_shared/staff-alert/send.ts), record the outcome in
 * agent_action_log and return the tool-facing result.
 */
export async function sendStaffWhatsappMessage(args: {
  supabase: Pick<DbClient, "auth" | "from" | "rpc">;
  supabaseUrl: string;
  serviceRoleKey: string;
  tenantId: string;
  phone: string;
  message: string;
  requesterUserId?: string | null;
  agentId?: string | null;
  conversationId?: string | null;
  recipient?: { entity_type?: string; id?: string; full_name?: string } | null;
  fetchImpl?: typeof fetch;
}): Promise<StaffAlertToolResult> {
  const result = await sendStaffAlert({
    supabase: args.supabase,
    supabaseUrl: args.supabaseUrl,
    serviceRoleKey: args.serviceRoleKey,
    tenantId: args.tenantId,
    phone: args.phone,
    message: args.message,
    requesterUserId: args.requesterUserId ?? null,
    fetchImpl: args.fetchImpl,
  });
  await logStaffAlertOutcome(args.supabase, {
    tenantId: args.tenantId,
    agentId: args.agentId,
    userId: args.requesterUserId,
    conversationId: args.conversationId,
    recipient: args.recipient,
    result,
  });
  return staffAlertToolResult(result);
}
