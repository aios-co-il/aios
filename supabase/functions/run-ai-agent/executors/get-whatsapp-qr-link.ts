import { assertGatewayLineAccess } from "./gateway-line-access.ts";
import { invokeExecutorFunction } from "./invoke-executor-function.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

type GetWhatsappQrLinkArgs = { integrationId: string };

/** Preserves the existing get_whatsapp_qr_link executor and side-effect order. */
export async function executeGetWhatsappQrLink(
  args: GetWhatsappQrLinkArgs,
  context: ToolExecutionContext,
) {
  const { supabase } = context;

  await assertGatewayLineAccess(context, args.integrationId);
  const res = await invokeExecutorFunction(supabase, "manage-manus-wa", {
    action: "get_qr_link",
    integrationId: args.integrationId,
  });
  const data = res.data;
  if (!res.ok) {
    return { error: data.error || `get_qr_link failed [${res.status}]` };
  }
  return data;
}
