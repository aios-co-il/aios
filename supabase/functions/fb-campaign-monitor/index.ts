// Cron (every 2h): reads the ad account of every active Meta report, records
// what Meta stopped and whether anything is live, and closes what cleared.
import type {} from "../_shared/edge-runtime.d.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import { runTenantScan } from "./scan.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

/** Tenants with an active Meta connection: each gets its own invocation. */
async function fanOutAllTenants() {
  const db = serviceClient();
  const { data: integrations, error } = await db
    .from("tenant_integrations")
    .select("tenant_id")
    .in("integration_type", ["facebook", "facebook_lead_ads"])
    .eq("is_active", true);
  if (error) {
    throw new Error(`tenant integrations read failed: ${error.message}`);
  }
  const tenantIds = [...new Set((integrations || []).map((i) => i.tenant_id))];
  const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/fb-campaign-monitor`;
  const auth = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  await Promise.all(
    tenantIds.map((tenantId) =>
      fetch(fnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ tenant_id: tenantId }),
      }).catch((e) =>
        console.error(
          "[fb-campaign-monitor] fanout error",
          tenantId,
          e instanceof Error ? e.message : e,
        ),
      ),
    ),
  );
  console.log("[fb-campaign-monitor] fanout dispatched", tenantIds.length);
  return { dispatched: tenantIds.length };
}

/** The request's tenant_id, or null for the cron's fan-out call. */
async function tenantIdOf(req: Request): Promise<string | null> {
  try {
    const body: unknown = await req.json();
    if (typeof body === "object" && body !== null && "tenant_id" in body) {
      return typeof body.tenant_id === "string" && body.tenant_id
        ? body.tenant_id
        : null;
    }
  } catch (_) {
    // An empty body is the cron's fan-out call.
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const tenantId = await tenantIdOf(req);
  try {
    if (tenantId) {
      // Per-tenant child invocation: scan in the background and acknowledge.
      EdgeRuntime.waitUntil(
        runTenantScan(tenantId).catch((e) =>
          console.error("[fb-campaign-monitor] child bg", tenantId, e),
        ),
      );
      return new Response(
        JSON.stringify({ success: true, started: true, tenant_id: tenantId }),
        { status: 202, headers: corsHeaders },
      );
    }
    EdgeRuntime.waitUntil(
      fanOutAllTenants().catch((e) =>
        console.error("[fb-campaign-monitor] parent bg", e),
      ),
    );
    return new Response(JSON.stringify({ success: true, started: true }), {
      status: 202,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("[fb-campaign-monitor]", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: corsHeaders },
    );
  }
});
