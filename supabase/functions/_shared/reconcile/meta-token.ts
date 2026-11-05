/**
 * The Meta token a report table syncs with (AIO-238), resolved in the same
 * order as sync-facebook-insights.
 */
import type { DbClient } from "../supabase-clients.ts";
import type { ReconcileTable } from "./types.ts";

/** tenant_integrations types that hold a Meta token. */
export const META_CONNECTION_TYPES = ["facebook", "facebook_lead_ads"];

/**
 * The connection pinned on the table, then an org/private one on its tenant,
 * then any active one on its tenant. The sync never borrows another tenant's
 * token, so the nightly worker does not either; only Carmen's on-demand check
 * passes `fallbackTenantIds` (the caller's own tenant, as before).
 */
export async function resolveMetaToken(
  db: Pick<DbClient, "from">,
  table: ReconcileTable,
  fallbackTenantIds: string[] = [],
): Promise<string | null> {
  const settings = table.integration_settings || {};
  const pinned = settings.integration_id || settings.integrationId;
  if (pinned) {
    const key = await pinnedMetaToken(db, String(pinned));
    if (key) {
      return key;
    }
  }
  const own =
    (await newestMetaToken(db, table.tenant_id, ["org", "private"])) ||
    (await newestMetaToken(db, table.tenant_id));
  if (own) {
    return own;
  }
  const extra = fallbackTenantIds.filter(
    (id, i, all) => id !== table.tenant_id && all.indexOf(id) === i,
  );
  for (const tenantId of extra) {
    const key = await newestMetaToken(db, tenantId);
    if (key) {
      return key;
    }
  }
  return null;
}

/** The pinned connection's token, when it is an active Meta connection. */
async function pinnedMetaToken(
  db: Pick<DbClient, "from">,
  integrationId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("tenant_integrations")
    .select("api_key, shared_from_integration_id")
    .eq("id", integrationId)
    .in("integration_type", META_CONNECTION_TYPES)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    throw new Error(`tenant_integrations: ${error.message}`);
  }
  return data ? withSharedKey(db, data) : null;
}

/** The token of the tenant's newest active Meta connection (of `visibility`, when given). */
async function newestMetaToken(
  db: Pick<DbClient, "from">,
  tenantId: string,
  visibility?: string[],
): Promise<string | null> {
  let q = db
    .from("tenant_integrations")
    .select("api_key, shared_from_integration_id")
    .eq("tenant_id", tenantId)
    .in("integration_type", META_CONNECTION_TYPES)
    .eq("is_active", true);
  if (visibility) {
    q = q.in("connection_visibility", visibility);
  }
  const { data, error } = await q
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`tenant_integrations: ${error.message}`);
  }
  return data ? withSharedKey(db, data) : null;
}

/** The connection's own token, or the one of the active connection it is shared from. */
async function withSharedKey(
  db: Pick<DbClient, "from">,
  row: { api_key?: string | null; shared_from_integration_id?: string | null },
): Promise<string | null> {
  if (row?.api_key) {
    return row.api_key;
  }
  if (!row?.shared_from_integration_id) {
    return null;
  }
  const { data, error } = await db
    .from("tenant_integrations")
    .select("api_key")
    .eq("id", row.shared_from_integration_id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    throw new Error(`tenant_integrations: ${error.message}`);
  }
  return data?.api_key || null;
}
