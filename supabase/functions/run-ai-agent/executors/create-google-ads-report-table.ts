import type { CreateGoogleAdsReportTableArgs } from "./google-ad-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { syncClientCardFromReportTable } from "../../_shared/client-report-sync.ts";

/** Preserves the existing create_google_ads_report_table executor and side-effect order. */
export async function executeCreateGoogleAdsReportTable(
  args: CreateGoogleAdsReportTableArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId, accessibleTenantIds, callerScope } =
    context;

  const client_id = args.client_id;
  const customer_id = String(args.customer_id || "").replace(/-/g, "");
  if (!client_id || !customer_id) {
    return { error: "client_id ו-customer_id נדרשים" };
  }
  await assertCallerCanAccessClient(supabase, client_id, callerScope);
  const { data: existing } = await supabase
    .from("crm_tables")
    .select("id, name")
    .in("tenant_id", accessibleTenantIds)
    .eq("client_id", client_id)
    .eq("integration_type", "google_ads")
    .maybeSingle();
  if (existing) {
    return {
      already_exists: true,
      table_id: existing.id,
      name: existing.name,
      message: `כבר קיימת טבלת דוח Google Ads ללקוח זה: ${existing.name}`,
    };
  }
  const { data: client } = await supabase
    .from("clients")
    .select("name, agency_id")
    .eq("id", client_id)
    .single();
  if (!client) {
    return { error: "לקוח לא נמצא" };
  }
  const accountName = args.account_name || customer_id;
  const slug = `google-ads-${client_id.substring(0, 8)}`;
  let tableTenantId = tenantId;
  if (client.agency_id) {
    const { data: agencyRow } = await supabase
      .from("agencies")
      .select("tenant_id")
      .eq("id", client.agency_id)
      .maybeSingle();
    if (agencyRow?.tenant_id) {
      tableTenantId = agencyRow.tenant_id;
    }
  }
  const { data: table, error } = await supabase
    .from("crm_tables")
    .insert({
      tenant_id: tableTenantId,
      name: client.name,
      slug,
      description: `דוח Google Ads עבור ${client.name} (${accountName})`,
      icon: "BarChart3",
      // Must match UI buckets in DynamicTables — never a generic "דוחות" silo.
      category: "Google Ads",
      integration_type: "google_ads",
      integration_settings: {
        customer_id,
        account_name: accountName,
        date_range: args.date_range || "last_30_days",
        sync_frequency: "daily",
        data_source: "direct_api",
        campaign_type: "leads",
        currency: "ILS",
      },
      agency_id: client.agency_id || null,
      client_id,
      created_by: userId !== "system" ? userId : null,
    })
    .select("id, name, slug")
    .single();
  if (error) {
    throw error;
  }
  await syncClientCardFromReportTable(supabase, {
    id: table.id,
    client_id,
    integration_type: "google_ads",
    integration_settings: {
      customer_id,
      account_name: accountName,
      date_range: args.date_range || "last_30_days",
      sync_frequency: "daily",
      data_source: "direct_api",
      campaign_type: "leads",
      currency: "ILS",
    },
  });
  return {
    success: true,
    table_id: table.id,
    name: table.name,
    slug: table.slug,
    customer_id,
    client_name: client.name,
    next: "קראי ל-sync_google_ads_report עם table_id כדי למשוך נתונים",
  };
}
