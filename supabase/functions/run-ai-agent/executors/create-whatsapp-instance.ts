import type { CreateWhatsappInstanceArgs } from "./admin-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing create_whatsapp_instance executor and side-effect order. */
export async function executeCreateWhatsappInstance(
  args: CreateWhatsappInstanceArgs,
  context: ToolExecutionContext,
) {
  const { tenantId, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = context;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-manus-wa`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      action: "create_instance",
      tenantId,
      displayName: args.displayName,
      countryCode: args.countryCode,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return {
      error: data.error || `create_instance failed [${res.status}]`,
    };
  }
  return data;
}
