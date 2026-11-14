import type { ConnectGoogleAdsAccountArgs } from "./google-ad-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing connect_google_ads_account executor and side-effect order. */
export async function executeConnectGoogleAdsAccount(
  args: ConnectGoogleAdsAccountArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, accessibleTenantIds } = context;

  const { client_id, customer_id } = args;
  if (!client_id || !customer_id) {
    return { error: "client_id ו-customer_id נדרשים" };
  }

  const cleanId = String(customer_id).replace(/-/g, "");

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, google_ads_account_id")
    .in("tenant_id", accessibleTenantIds)
    .eq("id", client_id)
    .maybeSingle();

  if (!client) {
    return { error: "לקוח לא נמצא" };
  }

  const { error: updateErr } = await supabase
    .from("clients")
    .update({ google_ads_account_id: cleanId })
    .eq("id", client_id);

  if (updateErr) {
    throw updateErr;
  }

  await supabase
    .from("agent_action_log")
    .insert({
      tenant_id: tenantId,
      action_type: "connect_google_ads_account",
      status: "success",
      action_details: {
        client_id,
        client_name: client.name,
        customer_id: cleanId,
        previous_id: client.google_ads_account_id ?? null,
      },
    })
    .then(
      () => {},
      () => {},
    );

  return {
    success: true,
    client_id,
    client_name: client.name,
    customer_id: cleanId,
  };
}
