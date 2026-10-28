/**
 * The Meta token a report table syncs with, in the order sync-facebook-insights
 * picks it: the connection stored on the table, then the tenant's org or
 * private connection, then any active Meta connection of the tenant. A shared
 * connection without its own key uses its source connection's key.
 */
import type { DbClient } from "./supabase-clients.ts";

const META_INTEGRATION_TYPES = ["facebook", "facebook_lead_ads"];

type Connection = {
  api_key: string | null;
  shared_from_integration_id: string | null;
};

export async function resolveMetaReportToken(
  db: Pick<DbClient, "from">,
  input: { tenantId: string; integrationId: string | null },
): Promise<string | null> {
  const columns = "api_key, shared_from_integration_id";
  let connection: Connection | null = null;
  if (input.integrationId) {
    const { data } = await db
      .from("tenant_integrations")
      .select(columns)
      .eq("id", input.integrationId)
      .in("integration_type", META_INTEGRATION_TYPES)
      .eq("is_active", true)
      .maybeSingle();
    connection = data;
  }
  if (!connection?.api_key) {
    const { data } = await db
      .from("tenant_integrations")
      .select(columns)
      .eq("tenant_id", input.tenantId)
      .in("integration_type", META_INTEGRATION_TYPES)
      .eq("is_active", true)
      .in("connection_visibility", ["org", "private"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    connection = data;
  }
  if (!connection?.api_key) {
    const { data } = await db
      .from("tenant_integrations")
      .select(columns)
      .eq("tenant_id", input.tenantId)
      .in("integration_type", META_INTEGRATION_TYPES)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    connection = data;
  }
  if (connection?.api_key) {
    return connection.api_key;
  }
  if (connection?.shared_from_integration_id) {
    const { data } = await db
      .from("tenant_integrations")
      .select("api_key")
      .eq("id", connection.shared_from_integration_id)
      .eq("is_active", true)
      .maybeSingle();
    return data?.api_key || null;
  }
  return null;
}
