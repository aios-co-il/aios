import type { CreateFacebookReportTableArgs } from "./ad-report-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { syncClientCardFromReportTable } from "../../_shared/client-report-sync.ts";

/** Preserves the existing create_facebook_report_table executor and side-effect order. */
export async function executeCreateFacebookReportTable(
  args: CreateFacebookReportTableArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId, accessibleTenantIds } = context;

  const { client_id, ad_account_id, ad_account_name } = args;
  // Check if table already exists for this client
  const { data: existing } = await supabase
    .from("crm_tables")
    .select("id, name")
    .in("tenant_id", accessibleTenantIds)
    .eq("client_id", client_id)
    .eq("integration_type", "facebook_insights")
    .maybeSingle();
  if (existing) {
    return {
      already_exists: true,
      table_id: existing.id,
      name: existing.name,
      message: `כבר קיימת טבלת דוח פייסבוק ללקוח זה: ${existing.name}`,
    };
  }
  // Get client name for the table name
  const { data: client } = await supabase
    .from("clients")
    .select("name, agency_id")
    .eq("id", client_id)
    .single();
  if (!client) {
    return { error: "לקוח לא נמצא" };
  }

  const tableName = client.name;
  const slug = `facebook-${client_id.substring(0, 8)}`;
  // Prefer the agency home tenant (shared agencies like DMM-MC live on DMM).
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
      name: tableName,
      slug,
      description: `דוח ביצועי מודעות פייסבוק עבור ${client.name} (${ad_account_name})`,
      icon: "BarChart3",
      // Must match UI buckets in DynamicTables — never a generic "דוחות" silo.
      category: "Facebook Insights",
      integration_type: "facebook_insights",
      integration_settings: { ad_account_id, ad_account_name },
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
    integration_type: "facebook_insights",
    integration_settings: { ad_account_id, ad_account_name },
  });
  return {
    success: true,
    table_id: table.id,
    name: table.name,
    slug: table.slug,
    ad_account_id,
    client_name: client.name,
  };
}
