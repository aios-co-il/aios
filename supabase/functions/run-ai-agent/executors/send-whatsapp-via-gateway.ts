import { assertGatewayLineAccess } from "./gateway-line-access.ts";
import { invokeExecutorFunction } from "./invoke-executor-function.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { defaultGatewayLine } from "../whatsapp-lines.ts";

type SendWhatsappViaGatewayArgs = {
  integrationId?: string;
  phone: string;
  message: string;
};

export async function executeSendWhatsappViaGateway(
  args: SendWhatsappViaGatewayArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const integrationId =
    args.integrationId || (await defaultGatewayLine(supabase, tenantId));
  if (!integrationId) {
    return {
      error:
        "לארגון אין קו manus_wa פעיל לשליחת וואטסאפ. אפשר לחבר קו בהגדרות האינטגרציות.",
    };
  }
  await assertGatewayLineAccess(context, integrationId, true);
  const res = await invokeExecutorFunction(supabase, "manage-manus-wa", {
    action: "send_message",
    integrationId,
    phone: args.phone,
    message: args.message,
  });
  const data = res.data;
  if (!res.ok) {
    return {
      error: data.error || `send_whatsapp_via_gateway failed [${res.status}]`,
    };
  }
  return data;
}
