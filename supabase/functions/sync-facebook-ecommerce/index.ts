import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { trustedInternalCron } from "../_shared/auth/edge-caller-auth.ts";
import {
  buildAllLevelInsightRecords,
  buildCampaignOptimizationGoalMap,
  buildResultLeadTypeMap,
  buildResultMetricMaps,
  type CampaignStatus,
  FB_INSIGHTS_FIELD_KEYS,
  FB_INSIGHTS_FIELD_NAMES,
  FB_INSIGHTS_FIELD_TYPES,
  latestCampaignUpdatedTime,
} from "../_shared/fbInsights.ts";
import {
  resolveAdsSyncWindow,
  toDateString,
} from "../_shared/report-sync-window.ts";
import {
  getArray,
  getPath,
  getString,
  isJsonObject,
} from "../_shared/provider-json.ts";

interface AdsetRow {
  id?: string;
  campaign_id?: string;
  optimization_goal?: string;
  promoted_object?: unknown;
}

function adsetRows(payload: unknown): AdsetRow[] {
  return getArray(payload, "data")
    .filter(isJsonObject)
    .map((row) => ({
      id: getString(row, "id"),
      campaign_id: getString(row, "campaign_id"),
      optimization_goal: getString(row, "optimization_goal"),
      promoted_object: row.promoted_object,
    }));
}
import { scheduledMarkerPatch } from "../_shared/ads-sync/outcome.ts";
import { redactSyncError } from "../_shared/ads-sync/redact.ts";
import { syncRunBody } from "../_shared/ads-sync/run-response.ts";
import {
  failedRunRecorder,
  saveSyncRun,
} from "../_shared/ads-sync/save-run.ts";
import { syncAdsWindow } from "../_shared/ads-sync/write-window.ts";

const SOURCE = "sync-facebook-ecommerce";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Set once the table is known, so an unexpected error is recorded as a failed run.
  let recordFailure: ((message: string) => Promise<void>) | null = null;
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    // Service-role client for writes (bypass RLS - tables can be in different tenants than the requester)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const requestBody = await req.json();
    const {
      table_id,
      start_date,
      end_date,
      scheduled_history_from,
      scheduled_synced_through,
      scheduled_lookback_on,
      update_last_sync = true,
    } = requestBody;

    // AIO-239: the body flag counts only from the service-role bearer.
    const internalCron = trustedInternalCron(
      requestBody,
      req.headers.get("Authorization"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );
    let userId: string | null = null;
    if (!internalCron) {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    }

    if (!table_id) {
      return new Response(JSON.stringify({ error: "table_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use admin client for reads to support both user and cron contexts
    const readClient = internalCron ? supabaseAdmin : supabase;

    // Get table with integration settings
    const { data: table, error: tableError } = await readClient
      .from("crm_tables")
      .select("*")
      .eq("id", table_id)
      .maybeSingle();

    if (tableError || !table) {
      console.error("Table lookup error:", tableError, "table_id:", table_id);
      return new Response(JSON.stringify({ error: "Table not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tableTenantId = table.tenant_id;

    if (table.integration_type !== "facebook_ecommerce") {
      return new Response(
        JSON.stringify({ error: "Table is not a Facebook Ecommerce table" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const settings = table.integration_settings || {};
    const rawAdAccountId = settings.ad_account_id;
    const adAccountId =
      rawAdAccountId && !String(rawAdAccountId).startsWith("act_")
        ? `act_${rawAdAccountId}`
        : rawAdAccountId;
    const dateRange = settings.date_range || "last_30_days";

    if (!adAccountId) {
      return new Response(
        JSON.stringify({ error: "No ad account configured" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Prefer the connection stored on the table (Anna/Yuval/David), then any active FB token on the tenant.
    const storedIntegrationId =
      settings.integration_id || settings.integrationId || null;
    let integration: {
      api_key?: string | null;
      shared_from_integration_id?: string | null;
    } | null = null;

    if (storedIntegrationId) {
      const { data: stored } = await supabaseAdmin
        .from("tenant_integrations")
        .select("api_key, shared_from_integration_id")
        .eq("id", storedIntegrationId)
        .in("integration_type", ["facebook", "facebook_lead_ads"])
        .eq("is_active", true)
        .maybeSingle();
      integration = stored;
    }

    if (!integration?.api_key) {
      const { data: orgIntegration } = await supabaseAdmin
        .from("tenant_integrations")
        .select("api_key, shared_from_integration_id")
        .eq("tenant_id", tableTenantId)
        .in("integration_type", ["facebook", "facebook_lead_ads"])
        .eq("is_active", true)
        .in("connection_visibility", ["org", "private"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      integration = orgIntegration;
    }

    if (!integration?.api_key) {
      const { data: fallback } = await supabaseAdmin
        .from("tenant_integrations")
        .select("api_key, shared_from_integration_id")
        .eq("tenant_id", tableTenantId)
        .in("integration_type", ["facebook", "facebook_lead_ads"])
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      integration = fallback;
    }

    // If this is a shared integration, fetch the source integration's token
    if (integration?.shared_from_integration_id && !integration?.api_key) {
      const { data: sourceIntegration } = await supabaseAdmin
        .from("tenant_integrations")
        .select("api_key")
        .eq("id", integration.shared_from_integration_id)
        .eq("is_active", true)
        .maybeSingle();

      if (sourceIntegration?.api_key) {
        integration = { ...integration, api_key: sourceIntegration.api_key };
      }
    }

    if (!integration?.api_key) {
      return new Response(
        JSON.stringify({ error: "Facebook not configured" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const accessToken = integration.api_key;
    const run = { tableId: table_id, tenantId: tableTenantId };
    recordFailure = failedRunRecorder(supabaseAdmin, {
      ...run,
      source: SOURCE,
      catchup: update_last_sync === false,
      fallbackSettings: settings,
    });

    // Calculate date range
    const now = new Date();
    let since: Date;
    let until = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (dateRange) {
      case "today":
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "yesterday":
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        until = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        break;
      case "this_week": {
        const dayOfWeek = now.getDay();
        since = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - dayOfWeek,
        );
        break;
      }
      case "last_week": {
        const dow = now.getDay();
        const startOfThisWeek = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - dow,
        );
        since = new Date(startOfThisWeek);
        since.setDate(startOfThisWeek.getDate() - 7);
        until = new Date(startOfThisWeek);
        until.setDate(startOfThisWeek.getDate() - 1);
        break;
      }
      case "last_7_days":
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
        until = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "last_14_days":
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14);
        break;
      case "this_month":
        since = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "last_30_days":
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
        break;
      case "last_60_days":
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60);
        break;
      case "last_90_days":
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
        break;
      case "last_120_days":
        since = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - 120,
        );
        break;
      default:
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    }

    // `date_range` is the table's display default; reports can look back further than
    // that, so always pull (and keep) at least the deepest report window.
    let syncWindow = resolveAdsSyncWindow(
      { startDate: toDateString(since), endDate: toDateString(until) },
      toDateString(now),
    );
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    if (
      typeof start_date === "string" &&
      typeof end_date === "string" &&
      isoDate.test(start_date) &&
      isoDate.test(end_date)
    ) {
      syncWindow = { startDate: start_date, endDate: end_date };
    }
    const sinceStr = syncWindow.startDate;
    const untilStr = syncWindow.endDate;

    const campaignsUrl = `https://graph.facebook.com/v21.0/${adAccountId}/campaigns?fields=id,name,effective_status,configured_status,objective,updated_time&limit=500&access_token=${accessToken}`;
    const campaignsResponse = await fetch(campaignsUrl);
    const campaignsData = await campaignsResponse.json();

    const campaignStatuses: Record<string, CampaignStatus> = {};
    if (campaignsData.data) {
      for (const campaign of campaignsData.data) {
        campaignStatuses[campaign.id] = {
          id: campaign.id,
          name: campaign.name,
          effective_status: campaign.effective_status,
          configured_status: campaign.configured_status,
          objective: campaign.objective || null,
          updated_time: campaign.updated_time || null,
        };
      }
    }

    const adsets: AdsetRow[] = [];
    {
      let next: string | null =
        `https://graph.facebook.com/v21.0/${adAccountId}/adsets?fields=id,campaign_id,optimization_goal,promoted_object&limit=500&access_token=${accessToken}`;
      while (next) {
        const r = await fetch(next);
        const d: unknown = await r.json();
        if (getPath(d, "error")) break;
        adsets.push(...adsetRows(d));
        next = getString(d, "paging", "next") || null;
      }
    }
    const campaignObjectives: Record<string, string | null | undefined> = {};
    for (const c of Object.values(campaignStatuses))
      campaignObjectives[c.id] = c.objective;
    const resultLeadTypes = buildResultLeadTypeMap(adsets, campaignObjectives);
    const optimizationGoals = buildCampaignOptimizationGoalMap(adsets);
    const resultMetrics = buildResultMetricMaps(adsets);

    const {
      records: insights,
      levelCounts,
      levelErrors,
    } = await buildAllLevelInsightRecords(
      adAccountId,
      sinceStr,
      untilStr,
      accessToken,
      campaignStatuses,
      resultLeadTypes,
      optimizationGoals,
      resultMetrics,
    );
    console.log(
      `[sync-facebook-ecommerce] synced ${insights.length} rows`,
      levelCounts,
    );

    const fieldKeys = FB_INSIGHTS_FIELD_KEYS;
    const fieldNames = FB_INSIGHTS_FIELD_NAMES;
    const fieldTypes = FB_INSIGHTS_FIELD_TYPES;

    // Create/update fields (use admin to bypass RLS for cross-tenant tables)
    for (let i = 0; i < fieldKeys.length; i++) {
      const { data: existingField } = await supabaseAdmin
        .from("crm_fields")
        .select("id")
        .eq("table_id", table_id)
        .eq("key", fieldKeys[i])
        .maybeSingle();

      if (!existingField) {
        const { error: fieldErr } = await supabaseAdmin
          .from("crm_fields")
          .insert({
            table_id,
            key: fieldKeys[i],
            name: fieldNames[i],
            type: fieldTypes[i],
            position: i,
          });
        if (fieldErr)
          console.error(
            `[sync-facebook-ecommerce] field insert error for ${fieldKeys[i]}:`,
            fieldErr.message,
          );
      }
    }

    // Admin client bypasses RLS; what may be replaced (table_id-only): see syncAdsWindow.
    const outcome = await syncAdsWindow(
      { deleteClient: supabaseAdmin },
      {
        tableId: table_id,
        tenantId: tableTenantId,
        createdBy: userId,
        window: syncWindow,
        records: insights,
        levelCounts,
        levelErrors,
        source: SOURCE,
      },
    );
    console.log(
      `[sync-facebook-ecommerce] outcome: ${outcome.status}, inserted: ${outcome.rows}`,
      outcome.error || "",
    );

    // last_sync_at (column + settings) and the scheduled markers move only after a
    // successful write; catch-up chunks (update_last_sync=false) never stamp it.
    const { lastSyncAt } = await saveSyncRun(supabaseAdmin, run, {
      outcome,
      catchup: update_last_sync === false,
      fallbackSettings: settings,
      settingsPatch: {
        last_campaign_updated_at: latestCampaignUpdatedTime(campaignStatuses),
        ...scheduledMarkerPatch(outcome.status, {
          scheduled_history_from,
          scheduled_synced_through,
          scheduled_lookback_on,
        }),
      },
    });

    const { body, status } = syncRunBody(outcome, lastSyncAt);
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in sync-facebook-ecommerce:", error);
    await recordFailure?.(
      error instanceof Error ? error.message : String(error),
    );
    // Upstream errors can print the request URL, Meta access token included.
    return new Response(
      JSON.stringify({
        error: redactSyncError(getPath(error, "message") ?? error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
