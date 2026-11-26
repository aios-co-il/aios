/**
 * The Meta token a report table syncs with, in the order sync-facebook-insights
 * picks it: the connection stored on the table, then the tenant's org or
 * private connection, then any active Meta connection of the tenant. Every
 * connection lookup is limited to the table's tenant, so a connection id stored
 * on a table cannot reach another tenant's connection. A shared connection
 * without its own key uses its source connection's key: the shared row lives in
 * the receiving tenant and its shared_from_integration_id points at the source.
 */
import type { DbClient } from "./supabase-clients.ts";

const META_INTEGRATION_TYPES = ["facebook", "facebook_lead_ads"];
const COLUMNS = "api_key, shared_from_integration_id";

type Connection = {
  api_key: string | null;
  shared_from_integration_id: string | null;
};

type Db = Pick<DbClient, "from">;

/** The table's Meta token; null when the tenant has none. Throws on a failed read. */
export async function resolveMetaReportToken(
  db: Db,
  input: { tenantId: string; integrationId: string | null },
): Promise<string | null> {
  let connection: Connection | null = null;
  if (input.integrationId) {
    connection = await storedConnection(
      db,
      input.tenantId,
      input.integrationId,
    );
  }

  if (!connection?.api_key) {
    connection = await latestConnection(db, input.tenantId, true);
  }

  if (!connection?.api_key) {
    connection = await latestConnection(db, input.tenantId, false);
  }

  if (connection?.api_key) {
    return connection.api_key;
  }

  if (connection?.shared_from_integration_id) {
    return sourceKey(db, connection.shared_from_integration_id);
  }

  return null;
}

/** The active Meta connection stored on the table, if it is the tenant's. */
async function storedConnection(
  db: Db,
  tenantId: string,
  integrationId: string,
): Promise<Connection | null> {
  const { data, error } = await db
    .from("tenant_integrations")
    .select(COLUMNS)
    .eq("id", integrationId)
    .eq("tenant_id", tenantId)
    .in("integration_type", META_INTEGRATION_TYPES)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    throw new Error(`stored Meta connection read failed: ${error.message}`);
  }

  return data;
}

/** The tenant's most recently updated active Meta connection; org or private only when asked. */
async function latestConnection(
  db: Db,
  tenantId: string,
  ownOnly: boolean,
): Promise<Connection | null> {
  let query = db
    .from("tenant_integrations")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .in("integration_type", META_INTEGRATION_TYPES)
    .eq("is_active", true);
  if (ownOnly) {
    query = query.in("connection_visibility", ["org", "private"]);
  }

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`tenant Meta connection read failed: ${error.message}`);
  }

  return data;
}

/** The key of the active source connection a shared connection points at. */
async function sourceKey(db: Db, sourceId: string): Promise<string | null> {
  const { data, error } = await db
    .from("tenant_integrations")
    .select("api_key")
    .eq("id", sourceId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    throw new Error(`shared Meta source read failed: ${error.message}`);
  }

  return data?.api_key || null;
}
