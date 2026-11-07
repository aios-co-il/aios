/**
 * Reads from Google Analytics for a dashboard: the client's GA connection
 * and one Data API report.
 */
import type { serviceClient } from "../_shared/supabase-clients.ts";
import type { GaRow } from "./reports.ts";

/** The client's GA property and its connection, or null without one. */
export async function readGaConnection(
  db: ReturnType<typeof serviceClient>,
  dashboard: { tenant_id: string; client_id: string },
) {
  const { data: table, error } = await db
    .from("crm_tables")
    .select("integration_settings")
    .eq("tenant_id", dashboard.tenant_id)
    .eq("client_id", dashboard.client_id)
    .eq("integration_type", "google_analytics")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[ga-event-users] GA table read failed:", error.message);
    return null;
  }
  const settings = table?.integration_settings as Record<
    string,
    unknown
  > | null;
  const integrationId = settings?.integrationId ?? settings?.integration_id;
  const propertyRaw = settings?.propertyId ?? settings?.property_id;
  if (typeof integrationId !== "string" || !propertyRaw) {
    return null;
  }
  const { data: integration, error: integrationError } = await db
    .from("tenant_integrations")
    .select("id, api_key, settings")
    .eq("id", integrationId)
    .eq("tenant_id", dashboard.tenant_id)
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

/** One GA Data API report; a failure is logged and comes back as ok: false. */
export async function gaReport(
  token: string,
  propertyId: string,
  method: string,
  request: unknown,
): Promise<{ ok: boolean; rows: Array<GaRow> }> {
  const [version, action] = method.split(":");
  const response = await fetch(
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
