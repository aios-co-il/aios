/**
 * The Google Ads connection a report table syncs with (AIO-238), found the way
 * sync-google-ads-data finds it: the pinned one, else the newest usable one of
 * the table's tenant or the tenants that share an agency with it.
 */
import { asRecord } from "../_shared/reconcile/json.ts";
import type { ReconcileTable } from "../_shared/reconcile/types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** The pinned active connection with a token, else the newest usable one of the tenant or its agency sources. */
export async function findGoogleConnection(
  db: Pick<DbClient, "from">,
  table: ReconcileTable,
) {
  const settings = table.integration_settings || {};
  const pinned = settings.integrationId || settings.integration_id;
  if (pinned) {
    const { data, error } = await db
      .from("tenant_integrations")
      .select("id, api_key, is_active, settings")
      .eq("id", String(pinned))
      .eq("integration_type", "google_ads")
      .maybeSingle();
    if (error) {
      throw new Error(`tenant_integrations: ${error.message}`);
    }
    if (data?.is_active && data?.api_key) {
      return data;
    }
  }
  const tenants = [
    table.tenant_id,
    ...(await agencySourceTenants(db, table.tenant_id)),
  ];
  const { data, error } = await db
    .from("tenant_integrations")
    .select("id, api_key, is_active, settings")
    .in("tenant_id", [...new Set(tenants)])
    .eq("integration_type", "google_ads")
    .eq("is_active", true)
    .order("updated_at", { ascending: false });
  if (error) {
    throw new Error(`tenant_integrations: ${error.message}`);
  }
  const usable = (data || []).filter((i) => i?.api_key);
  return (
    usable.find((i) => !asRecord(i.settings).needs_reauth) || usable[0] || null
  );
}

/** Tenants that share an agency with `tenantId` (agency_tenant_access), as the sync reads them. */
async function agencySourceTenants(
  db: Pick<DbClient, "from">,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("agency_tenant_access")
    .select("source_tenant_id")
    .eq("accessing_tenant_id", tenantId);
  if (error) {
    throw new Error(`agency_tenant_access: ${error.message}`);
  }
  return (data || [])
    .map((r) => r.source_tenant_id)
    .filter((id): id is string => !!id);
}
