import type { ResolveCampaignAlertArgs } from "./campaign-alert-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing resolve_campaign_alert executor and side-effect order. */
export async function executeResolveCampaignAlert(
  args: ResolveCampaignAlertArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const { error } = await supabase
    .from("campaign_alerts")
    .update({
      resolved_at: new Date().toISOString(),
      acknowledged_at: new Date().toISOString(),
    })
    .eq("id", args.alert_id)
    .in("tenant_id", accessibleTenantIds);
  if (error) {
    return { error: error.message };
  }
  return { success: true, alert_id: args.alert_id, resolved: true };
}
