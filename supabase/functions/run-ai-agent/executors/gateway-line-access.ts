import type { ToolExecutionContext } from "../tool-context.ts";
import { tenantCanUseIntegration } from "../../_shared/auth/tenant-access.ts";
import { GATEWAY_LINE_TYPE } from "../whatsapp-lines.ts";

/** Service-role invocation must not turn a supplied ID into cross-tenant authority. */
export async function assertGatewayLineAccess(
  context: ToolExecutionContext,
  integrationId: string,
  allowSharedSend = false,
) {
  const { supabase, tenantId } = context;
  const { data, error } = await supabase
    .from("tenant_integrations")
    .select("id")
    .eq("id", integrationId)
    .eq("tenant_id", tenantId)
    .eq("integration_type", GATEWAY_LINE_TYPE)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (data) {
    return;
  }
  if (
    allowSharedSend &&
    (await tenantCanUseIntegration(supabase, tenantId, integrationId))
  ) {
    return;
  }

  console.warn("[gateway] integration access denied");
  throw new Error("integration_not_authorized");
}
