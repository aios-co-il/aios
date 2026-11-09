import type { GetWhatsappQrLinkArgs } from "./admin-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing get_whatsapp_qr_link executor and side-effect order. */
export async function executeGetWhatsappQrLink(
  args: GetWhatsappQrLinkArgs,
  context: ToolExecutionContext,
) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = context;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-manus-wa`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      action: "get_qr_link",
      integrationId: args.integrationId,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { error: data.error || `get_qr_link failed [${res.status}]` };
  }
  return data;
}
