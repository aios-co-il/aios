import type { SendMessageArgs } from "./messaging-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { sendTargetFor } from "../chat-scope/send-target.ts";

/** Preserves the existing send_message executor and side-effect order. */
export async function executeSendMessage(
  args: SendMessageArgs,
  context: ToolExecutionContext,
) {
  const {
    supabase,
    tenantId,
    accessibleTenantIds,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  } = context;

  const { phone, contactName } = await sendTargetFor(
    supabase,
    args.contact_type,
    args.contact_id,
    accessibleTenantIds,
  );
  if (!phone) {
    return { success: false, error: "לא נמצא מספר טלפון" };
  }
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/send-green-api-message`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        phone,
        message: args.message_text,
        tenantId,
        [`${args.contact_type}_id`]: args.contact_id,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return { sent_to: contactName, phone };
}
