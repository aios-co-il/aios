import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";

type SyncFacebookInsightsArgs = {
  table_id?: string;
  client_id?: string;
};

/** Runs the sync_facebook_insights tool after checking the caller can reach the client. */
export async function executeSyncFacebookInsights(
  args: SyncFacebookInsightsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds, callerScope, name } = context;

  let tableId = args.table_id as string | undefined;
  const integType =
    name === "sync_google_ads_report" ? "google_ads" : "facebook_insights";
  if (!tableId && args.client_id) {
    await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
    const { data: tbl } = await supabase
      .from("crm_tables")
      .select("id, name")
      .in("tenant_id", accessibleTenantIds)
      .eq("client_id", args.client_id)
      .eq("integration_type", integType)
      .maybeSingle();
    if (!tbl) {
      return {
        error: `לא נמצאה טבלת ${integType} ללקוח — צרי קודם עם create_${integType === "google_ads" ? "google_ads_report_table" : "facebook_report_table"}`,
      };
    }
    tableId = tbl.id;
  }
  if (!tableId) {
    return { error: "table_id או client_id נדרש" };
  }
  const { data: table } = await supabase
    .from("crm_tables")
    .select("id, name, tenant_id, integration_type, client_id")
    .eq("id", tableId)
    .in("tenant_id", accessibleTenantIds)
    .maybeSingle();
  if (!table) {
    return { error: "טבלה לא נמצאה" };
  }
  // A table_id names its client only through the table, so check it here too.
  if (table.client_id) {
    await assertCallerCanAccessClient(supabase, table.client_id, callerScope);
  } else if (
    !callerScope.isManagerRole &&
    (callerScope.isTeamManager || callerScope.callerCampaignerId)
  ) {
    return { error: "לטבלה זו אין לקוח משויך — רק מנהל יכול לסנכרן אותה" };
  }
  if (table.integration_type !== integType) {
    return {
      error: `טבלה זו היא ${table.integration_type}, לא ${integType}`,
    };
  }

  const fnName =
    name === "sync_google_ads_report"
      ? "sync-google-ads-data"
      : "sync-facebook-insights";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string,
    "x-internal-cron": "true",
  };
  const res = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/${fnName}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ table_id: tableId }),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: "sync_failed", details: json };
  }
  return {
    success: true,
    table_id: tableId,
    table_name: table.name,
    sync: json,
  };
}
