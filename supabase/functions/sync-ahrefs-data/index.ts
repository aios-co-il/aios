import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getArray,
  getObject,
  getPath,
  getString,
} from "../_shared/provider-json-b24.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AhrefsConfig {
  target?: string; // Domain to analyze
  dataType:
    "site_explorer" | "backlinks" | "organic_traffic" | "referring_domains";
  country?: string;
  limit?: number | string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ahrefsApiKey = Deno.env.get("AHREFS_API_KEY");

    if (!ahrefsApiKey) {
      return new Response(
        JSON.stringify({ error: "Ahrefs API key not configured" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: activeTenant } = await supabase
      .from("user_active_tenant")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single();

    const tenantId = activeTenant?.tenant_id;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "No active tenant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    let { tableId, config } = body as {
      tableId: string;
      config?: AhrefsConfig;
    };
    // Accept snake_case as well
    const bodyTableId = getString(body, "table_id");
    if (!tableId && bodyTableId) tableId = bodyTableId;

    if (!tableId) {
      return new Response(JSON.stringify({ error: "Missing tableId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tableRow, error: tableError } = await supabase
      .from("crm_tables")
      .select("tenant_id, client_id, integration_settings")
      .eq("id", tableId)
      .single();

    if (tableError || !tableRow) {
      return new Response(JSON.stringify({ error: "CRM table not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const settings = getObject(tableRow.integration_settings) ?? {};

    // Fallback: if config or target wasn't provided, load it from the table's integration_settings
    if (!config || !config.target) {
      const settingsLimit = settings.limit;
      config = {
        target:
          config?.target ||
          getString(settings, "targetDomain") ||
          getString(settings, "target") ||
          getString(settings, "domain"),
        dataType: (config?.dataType ||
          getString(settings, "reportType") ||
          getString(settings, "dataType") ||
          "site_explorer") as AhrefsConfig["dataType"],
        country: config?.country || getString(settings, "country"),
        limit:
          config?.limit ||
          (typeof settingsLimit === "number" ||
          typeof settingsLimit === "string"
            ? settingsLimit
            : undefined),
      };
    }

    // SEO report tables ('seo_unified' / 'ahrefs_reports') are backed by stored
    // ahrefs_reports snapshots keyed by client — they do NOT need a target domain
    // (target is only an optional filter there). Only live Site Explorer syncs
    // require a target, so don't block reports-backed tables on a missing target.
    const isReportsBacked =
      settings.data_source === "ahrefs_reports" ||
      settings.data_source === "seo_unified";

    if (!config.target && !isReportsBacked) {
      return new Response(
        JSON.stringify({
          error:
            "Missing target domain (set targetDomain in integration_settings)",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // SEO report tables are backed by ahrefs_reports. They should refresh from
    // stored snapshots instead of calling the older Site Explorer endpoints.
    if (isReportsBacked) {
      const clientId =
        settings.clientId || settings.client_id || tableRow.client_id;
      if (!clientId) {
        return new Response(
          JSON.stringify({
            error: "Missing client ID for Ahrefs reports table",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { data: reports, error: reportsError } = await supabase
        .from("ahrefs_reports")
        .select("*")
        .eq("tenant_id", tableRow.tenant_id)
        .eq("client_id", clientId)
        .order("report_date", { ascending: false });

      if (reportsError) throw reportsError;

      const targetForFilter = String(config.target || "")
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "");
      const matchedReports = (reports || []).filter(
        (report: { domain?: unknown }) => {
          const reportDomain = String(report.domain || "")
            .replace(/^https?:\/\//, "")
            .replace(/^www\./, "")
            .replace(/\/.*$/, "");
          return !targetForFilter || reportDomain === targetForFilter;
        },
      );

      const reportsToUse =
        matchedReports.length > 0 ? matchedReports : reports || [];
      const reportRows: unknown[] = reportsToUse;
      const recordsToInsert: {
        table_id: string;
        tenant_id: string;
        data: object;
      }[] = [];

      for (const report of reportRows) {
        const rd = getPath(report, "report_data") || {};
        const snapshot = getPath(rd, "snapshot") || {};
        const snap = (key: string) => getPath(snapshot, key);
        const reportDate =
          getPath(report, "report_date") || getPath(report, "received_at");
        const reportDomain = getPath(report, "domain");
        const allKeywords = [
          ...getArray(rd, "organic_keywords"),
          ...getArray(rd, "tracked_keywords"),
        ];

        if (allKeywords.length > 0) {
          for (const kw of allKeywords) {
            const position = getPath(kw, "position");
            const positionPrevMonth = getPath(kw, "position_prev_month");
            recordsToInsert.push({
              table_id: tableId,
              tenant_id: tableRow.tenant_id,
              data: {
                keyword: String(getPath(kw, "keyword") || ""),
                position: position ?? null,
                position_prev_month: positionPrevMonth ?? null,
                position_change:
                  positionPrevMonth != null && position != null
                    ? Number(positionPrevMonth) - Number(position)
                    : null,
                traffic: getPath(kw, "traffic") ?? 0,
                traffic_prev_month: getPath(kw, "traffic_prev_month") ?? 0,
                volume: getPath(kw, "volume") ?? 0,
                kd: getPath(kw, "kd") ?? null,
                cpc: getPath(kw, "cpc") ?? null,
                url: getPath(kw, "url") ?? "",
                domain: reportDomain,
                dr: snap("dr"),
                report_date: reportDate,
              },
            });
          }
        } else {
          recordsToInsert.push({
            table_id: tableId,
            tenant_id: tableRow.tenant_id,
            data: {
              domain: reportDomain,
              dr: snap("dr"),
              org_traffic: snap("org_traffic"),
              org_keywords_top3: snap("org_keywords_top3"),
              org_keywords_top10: snap("org_keywords_top10"),
              org_keywords_total: snap("org_keywords_total"),
              referring_domains: snap("referring_domains"),
              backlinks_live: snap("backlinks_live"),
              backlinks_all_time: snap("backlinks_all_time"),
              report_date: reportDate,
            },
          });
        }
      }

      await supabase.from("crm_records").delete().eq("table_id", tableId);
      for (let i = 0; i < recordsToInsert.length; i += 500) {
        const { error: insertError } = await supabase
          .from("crm_records")
          .insert(recordsToInsert.slice(i, i + 500));
        if (insertError) throw insertError;
      }

      const syncedAt = new Date().toISOString();
      await supabase
        .from("crm_tables")
        .update({
          last_sync_at: syncedAt,
          integration_settings: { ...settings, last_sync_at: syncedAt },
        })
        .eq("id", tableId);

      return new Response(
        JSON.stringify({
          success: true,
          recordsCount: recordsToInsert.length,
          reportsCount: reportsToUse.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizeTarget = (raw: string) => {
      // Accept domain or full URL; send only hostname/domain to Ahrefs
      try {
        if (raw.startsWith("http://") || raw.startsWith("https://")) {
          return new URL(raw).hostname;
        }
      } catch {
        // ignore
      }
      return raw.replace(/^https?:\/\//, "").split("/")[0];
    };

    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const target = normalizeTarget(config.target);

    let apiUrl = "";
    let selectFields: string[] = [];

    // Build API request based on data type (Site Explorer endpoints - available on standard plans)
    switch (config.dataType) {
      case "organic_traffic":
        // Organic Keywords report (requires date)
        apiUrl = `https://api.ahrefs.com/v3/site-explorer/organic-keywords?target=${encodeURIComponent(target)}&date=${encodeURIComponent(date)}&country=${config.country || "il"}&protocol=both&mode=subdomains&output=json&limit=${config.limit || 1000}&select=keyword,volume,keyword_difficulty,cpc,traffic,traffic_percentage,position,url,serp_features`;
        selectFields = [
          "keyword",
          "volume",
          "keyword_difficulty",
          "cpc",
          "traffic",
          "traffic_percentage",
          "position",
          "url",
          "serp_features",
        ];
        break;

      case "backlinks":
        // Backlinks report (requires date)
        apiUrl = `https://api.ahrefs.com/v3/site-explorer/all-backlinks?target=${encodeURIComponent(target)}&date=${encodeURIComponent(date)}&protocol=both&mode=subdomains&output=json&limit=${config.limit || 1000}&select=url_from,url_to,anchor,domain_rating_source,url_rating_source,traffic,first_seen,last_seen,nofollow,is_dofollow`;
        selectFields = [
          "url_from",
          "url_to",
          "anchor",
          "domain_rating_source",
          "url_rating_source",
          "traffic",
          "first_seen",
          "last_seen",
          "nofollow",
          "is_dofollow",
        ];
        break;

      case "referring_domains":
        // Referring Domains report (requires date)
        apiUrl = `https://api.ahrefs.com/v3/site-explorer/refdomains?target=${encodeURIComponent(target)}&date=${encodeURIComponent(date)}&protocol=both&mode=subdomains&output=json&limit=${config.limit || 1000}&select=domain,domain_rating,backlinks,first_seen,last_seen,linked_domains`;
        selectFields = [
          "domain",
          "domain_rating",
          "backlinks",
          "first_seen",
          "last_seen",
          "linked_domains",
        ];
        break;

      case "site_explorer":
      default:
        // Domain overview (default) (requires date)
        apiUrl = `https://api.ahrefs.com/v3/site-explorer/metrics?target=${encodeURIComponent(target)}&date=${encodeURIComponent(date)}&protocol=both&mode=subdomains&output=json&volume_mode=monthly`;
        selectFields = [
          "domain_rating",
          "ahrefs_rank",
          "organic_traffic",
          "organic_keywords",
          "backlinks",
          "referring_domains",
          "organic_value",
        ];
        break;
    }

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${ahrefsApiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Ahrefs API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Ahrefs API error", details: errorText }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const apiData = await response.json();

    // Determine the data array from response
    let records: unknown[] = [];
    if (apiData.keywords) {
      records = apiData.keywords;
    } else if (apiData.backlinks) {
      records = apiData.backlinks;
    } else if (apiData.refdomains) {
      records = apiData.refdomains;
    } else if (apiData.metrics) {
      // Single overview response
      const m = apiData.metrics;
      records = [
        {
          domain_rating: m.domain_rating,
          ahrefs_rank: m.ahrefs_rank,
          organic_traffic: m.org_traffic ?? m.organic_traffic,
          organic_keywords: m.org_keywords ?? m.organic_keywords,
          backlinks: m.backlinks,
          referring_domains: m.refdomains ?? m.referring_domains,
          organic_value: m.org_cost ?? m.organic_value,
        },
      ];
    } else {
      records = [apiData];
    }

    // Ensure fields exist for this table
    const { data: existingFields } = await supabase
      .from("crm_fields")
      .select("key")
      .eq("table_id", tableId);

    const existingKeys = new Set(existingFields?.map((f) => f.key) || []);

    // Field labels in Hebrew
    const fieldLabels: Record<string, string> = {
      keyword: "מילת מפתח",
      volume: "נפח חיפוש",
      keyword_difficulty: "קושי",
      cpc: "מחיר לקליק",
      traffic: "תנועה",
      traffic_percentage: "אחוז תנועה",
      position: "מיקום",
      position_diff: "שינוי מיקום",
      traffic_diff: "שינוי תנועה",
      serp_updated: "עדכון אחרון",
      url: "כתובת",
      url_from: "קישור מ-",
      url_to: "קישור ל-",
      anchor: "אנקור",
      domain_rating_source: "DR מקור",
      url_rating_source: "UR מקור",
      first_seen: "נראה לראשונה",
      last_seen: "נראה לאחרונה",
      nofollow: "Nofollow",
      is_dofollow: "Dofollow",
      domain_rating: "Domain Rating",
      ahrefs_rank: "Ahrefs Rank",
      organic_traffic: "תנועה אורגנית",
      organic_keywords: "מילות מפתח אורגניות",
      backlinks: "בקלינקים",
      referring_domains: "דומיינים מפנים",
      organic_value: "ערך אורגני",
      clicks: "קליקים",
      clicks_percentage: "אחוז קליקים",
      global_volume: "נפח גלובלי",
      cpc_usd: "CPC (דולר)",
      serp_features: "SERP Features",
    };

    const fieldTypes: Record<string, string> = {
      keyword: "text",
      volume: "number",
      keyword_difficulty: "number",
      cpc: "number",
      traffic: "number",
      traffic_percentage: "number",
      position: "number",
      position_diff: "number",
      traffic_diff: "number",
      serp_updated: "date",
      url: "url",
      url_from: "url",
      url_to: "url",
      anchor: "text",
      domain_rating_source: "number",
      url_rating_source: "number",
      first_seen: "date",
      last_seen: "date",
      nofollow: "checkbox",
      is_dofollow: "checkbox",
      domain_rating: "number",
      ahrefs_rank: "number",
      organic_traffic: "number",
      organic_keywords: "number",
      backlinks: "number",
      referring_domains: "number",
      organic_value: "number",
      clicks: "number",
      clicks_percentage: "number",
      global_volume: "number",
      cpc_usd: "number",
      serp_features: "text",
    };

    // Create missing fields
    const newFields = selectFields.filter((f) => !existingKeys.has(f));
    if (newFields.length > 0) {
      const fieldsToInsert = newFields.map((key, index) => ({
        table_id: tableId,
        key,
        name: fieldLabels[key] || key,
        type: fieldTypes[key] || "text",
        position: existingKeys.size + index,
        is_required: false,
        is_visible: true,
        config: {},
      }));

      await supabase.from("crm_fields").insert(fieldsToInsert);
    }

    // Delete existing records
    await supabase.from("crm_records").delete().eq("table_id", tableId);

    // Insert new records
    const recordsToInsert = records.map((record) => ({
      table_id: tableId,
      tenant_id: tenantId,
      data: record,
    }));

    if (recordsToInsert.length > 0) {
      // Insert in batches of 500
      const batchSize = 500;
      for (let i = 0; i < recordsToInsert.length; i += batchSize) {
        const batch = recordsToInsert.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from("crm_records")
          .insert(batch);
        if (insertError) {
          console.error("Error inserting records:", insertError);
        }
      }
    }

    // Update table sync timestamp
    await supabase
      .from("crm_tables")
      .update({
        last_sync_at: new Date().toISOString(),
        integration_settings: {
          ...config,
          last_sync_at: new Date().toISOString(),
        },
      })
      .eq("id", tableId);

    return new Response(
      JSON.stringify({
        success: true,
        recordsCount: records.length,
        message: `Synced ${records.length} records from Ahrefs`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in sync-ahrefs-data:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
