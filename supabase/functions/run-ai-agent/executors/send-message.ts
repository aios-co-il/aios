import { tenantUserAccess } from "../../_shared/auth/tenant-access.ts";
import { FunctionsHttpError } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { ToolExecutionContext } from "../tool-context.ts";
import { sendTargetFor } from "../chat-scope/send-target.ts";

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Sends a WhatsApp message to a client or lead. In a chat it only queues the
 * message for approval as an `agent_direct_tool` row; the send runs when
 * carmen-approval-execute hands the approved row back (approval.outOfBand).
 */
export async function executeSendMessage(
  args: SendMessageArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, accessibleTenantIds, actorUserId, userId } =
    context;

  const {
    phone,
    contactName,
    tenantId: contactTenantId,
  } = await sendTargetFor(
    supabase,
    args.contact_type,
    args.contact_id,
    accessibleTenantIds,
  );
  if (!phone) {
    return { success: false, error: "לא נמצא מספר טלפון" };
  }
  const senderUserId = actorUserId || userId;
  if (contactTenantId && contactTenantId !== tenantId) {
    const access = senderUserId
      ? await tenantUserAccess(supabase, contactTenantId, senderUserId)
      : { member: false, superAdmin: false };
    if (!access.member && !access.superAdmin) {
      console.warn("[send_message] shared tenant send requires membership");
      return { success: false, error: "shared_tenant_send_not_authorized" };
    }
  }
  if (context.approval.outOfBand !== true) {
    return queueSendMessage(args, context, senderUserId, contactName);
  }
  const { error } = await supabase.functions.invoke("send-green-api-message", {
    body: {
      phoneNumber: phone,
      message: args.message_text,
      tenantId: contactTenantId || tenantId,
      senderUserId,
      ...(args.contact_type === "client"
        ? { clientId: args.contact_id }
        : { leadId: args.contact_id }),
    },
  });
  if (error instanceof FunctionsHttpError) {
    throw new Error(await error.context.text());
  }
  if (error) {
    throw error;
  }
  return { sent_to: contactName, phone };
}

/** Queues the message for approval and tells Carmen to ask for it. */
async function queueSendMessage(
  args: SendMessageArgs,
  context: ToolExecutionContext,
  requester: string | null,
  contactName: string | null,
) {
  if (!requester) {
    return { success: false, error: "send_message_requires_requester" };
  }
  const recipient = contactName || args.contact_id;
  const { data, error } = await context.supabase
    .from("agent_approval_queue")
    .insert({
      tenant_id: context.tenantId,
      agent_id: context.agentId || null,
      requested_by: requester,
      action_type: "agent_direct_tool",
      title: `הודעת WhatsApp ל${recipient}`,
      description: args.message_text,
      tool_name: "send_message",
      tool_input: { ...args },
      context: { source: "carmen_send_message", contact_name: contactName },
      status: "pending",
      expires_at: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    throw error;
  }
  return {
    pending_approval: true,
    approval_id: data.id,
    summary: `הודעת WhatsApp ל${recipient}: ${args.message_text}`,
    instruction_for_carmen:
      'הציגי למשתמש את הנמען ואת נוסח ההודעה ובקשי אישור: "לשלוח? (כן/לא)". אל תכתבי שנשלח עד ש-execute_pending_approval מחזיר success=true.',
  };
}

type SendMessageArgs = {
  contact_type: "lead" | "client";
  contact_id: string;
  message_text: string;
};
