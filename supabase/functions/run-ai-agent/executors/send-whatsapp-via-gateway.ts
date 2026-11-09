import type { SendWhatsappViaGatewayArgs } from "./admin-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { defaultGatewayLine } from "../whatsapp-lines.ts";

/** Preserves the existing send_whatsapp_via_gateway executor and side-effect order. */
export async function executeSendWhatsappViaGateway(
  args: SendWhatsappViaGatewayArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } =
    context;

  const integrationId =
    args.integrationId || (await defaultGatewayLine(supabase, tenantId));
  if (!integrationId) {
    return {
      error:
        "לארגון אין קו manus_wa פעיל לשליחת וואטסאפ. אפשר לחבר קו בהגדרות האינטגרציות.",
    };
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-manus-wa`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      action: "send_message",
      integrationId,
      phone: args.phone,
      message: args.message,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return {
      error: data.error || `send_whatsapp_via_gateway failed [${res.status}]`,
    };
  }
  return data;
}
