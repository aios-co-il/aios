/**
 * Reads from Google Analytics for a dashboard: the client's GA connection
 * and one Data API report.
 */
import type { serviceClient } from "../_shared/supabase-clients.ts";
import type { GaRow } from "./reports.ts";

/**
 * The client's GA property and its connection, or null without one. The GA
 * table may sit under another tenant than the dashboard (as in
 * public-dashboard), so it is found by the authorized dashboard's client,
 * preferring the dashboard tenant's own table and else the oldest, and the
 * connection is read under that table's own tenant.
 */
export async function readGaConnection(
  db: ReturnType<typeof serviceClient>,
  dashboard: { tenant_id: string; client_id: string },
) {
  const { data: tables, error } = await db
    .from("crm_tables")
    .select("tenant_id, integration_settings")
    .eq("client_id", dashboard.client_id)
    .eq("integration_type", "google_analytics")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[ga-event-users] GA table read failed:", error.message);
    return null;
  }
  const table =
    tables?.find((row) => row.tenant_id === dashboard.tenant_id) ?? tables?.[0];
  const settings = table?.integration_settings as Record<
    string,
    unknown
  > | null;
  const integrationId = settings?.integrationId ?? settings?.integration_id;
  const propertyRaw = settings?.propertyId ?? settings?.property_id;
  if (!table || typeof integrationId !== "string" || !propertyRaw) {
    return null;
  }
  const { data: integration, error: integrationError } = await db
    .from("tenant_integrations")
    .select("id, api_key, settings")
    .eq("id", integrationId)
    .eq("tenant_id", table.tenant_id)
    .maybeSingle();
  if (integrationError || !integration) {
    console.error(
      "[ga-event-users] GA connection read failed:",
      integrationError?.message,
    );
    return null;
  }
  return {
    integration,
    propertyId: String(propertyRaw).replace(/^properties\//, ""),
  };
}

/** One GA Data API report; any failure is logged and comes back as ok: false. */
export async function gaReport(
  token: string,
  propertyId: string,
  method: string,
  request: unknown,
): Promise<{ ok: boolean; rows: Array<GaRow> }> {
  const [version, action] = method.split(":");
  let response: Response;
  try {
    response = await fetch(
      `https://analyticsdata.googleapis.com/${version}/properties/${propertyId}:${action}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      },
    );
  } catch (error) {
    // A dropped connection fails this report only, so a failed funnel still
    // leaves the counts.
    console.error(`[ga-event-users] ${action} unreachable:`, error);
    return { ok: false, rows: [] };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    console.error(
      `[ga-event-users] ${action} failed:`,
      response.status,
      data.error?.message,
    );
    return { ok: false, rows: [] };
  }
  // The funnel report nests its rows under funnelTable.
  return { ok: true, rows: data.rows ?? data.funnelTable?.rows ?? [] };
}
