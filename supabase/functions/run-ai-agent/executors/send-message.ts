import { FunctionsHttpError } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { ToolExecutionContext } from "../tool-context.ts";
import { sendTargetFor } from "../chat-scope/send-target.ts";

/** Preserves the existing send_message executor and side-effect order. */
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
  const { error } = await supabase.functions.invoke("send-green-api-message", {
    body: {
      phoneNumber: phone,
      message: args.message_text,
      tenantId: contactTenantId || tenantId,
      senderUserId: actorUserId || userId,
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

type SendMessageArgs = {
  contact_type: "lead" | "client";
  contact_id: string;
  message_text: string;
};
