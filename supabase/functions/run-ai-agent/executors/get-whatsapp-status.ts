import type { GetWhatsappStatusArgs } from "./admin-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing get_whatsapp_status executor and side-effect order. */
export async function executeGetWhatsappStatus(
  args: GetWhatsappStatusArgs,
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
      action: "get_status",
      integrationId: args.integrationId,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { error: data.error || `get_status failed [${res.status}]` };
  }
  return data;
}
