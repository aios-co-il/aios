import type { GetCampaignAlertsArgs } from "./campaign-alert-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing get_campaign_alerts executor and side-effect order. */
export async function executeGetCampaignAlerts(
  args: GetCampaignAlertsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  let q = supabase
    .from("campaign_alerts")
    .select(
      "id, tenant_id, client_id, campaign_id, campaign_name, alert_type, severity, details, created_at, acknowledged_at, resolved_at",
    )
    .in("tenant_id", accessibleTenantIds)
    .order("created_at", { ascending: false })
    .limit(100);
  if (args.client_id) {
    q = q.eq("client_id", args.client_id);
  }
  if (args.severity) {
    q = q.eq("severity", args.severity);
  }
  if (args.only_open !== false) {
    q = q.is("resolved_at", null).is("acknowledged_at", null);
  }
  const { data, error } = await q;
  if (error) {
    return { error: error.message };
  }
  return { count: data?.length || 0, alerts: data || [] };
}
