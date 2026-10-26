import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  getArray,
  getNumber,
  getPath,
  getString,
} from "../_shared/provider-json-b24.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://open.tiktokapis.com/v2";

interface VideoRecord {
  video_id: string;
  title: string;
  description: string;
  create_time: string;
  cover_image_url: string;
  share_url: string;
  embed_link: string;
  duration_sec: number;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  engagement_rate: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TIKTOK_ACCESS_TOKEN = Deno.env.get("TIKTOK_ACCESS_TOKEN");
    const TIKTOK_API_KEY = Deno.env.get("TIKTOK_API_KEY");
    if (!TIKTOK_ACCESS_TOKEN)
      throw new Error("TIKTOK_ACCESS_TOKEN not configured");
    if (!TIKTOK_API_KEY) throw new Error("TIKTOK_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();
    const { table_id, _internal_cron } = body;

    let userId: string | null = null;
    if (!_internal_cron) {
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

    const readClient = _internal_cron ? supabaseAdmin : supabase;
    const { data: table, error: tableError } = await readClient
      .from("crm_tables")
      .select("*")
      .eq("id", table_id)
      .maybeSingle();
    if (tableError || !table) {
      return new Response(JSON.stringify({ error: "Table not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (table.integration_type !== "tiktok_content") {
      return new Response(
        JSON.stringify({ error: "Table is not a TikTok Content table" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const settings = table.integration_settings || {};
    const tableTenantId = table.tenant_id;
    const maxVideos = Math.max(1, Math.min(200, settings.max_videos ?? 50));

    // Verify connection exists for this tenant
    const { data: integration } = await supabaseAdmin
      .from("tenant_integrations")
      .select("id, is_active, settings")
      .eq("tenant_id", tableTenantId)
      .eq("integration_type", "tiktok")
      .eq("is_active", true)
      .maybeSingle();
    if (!integration) {
      return new Response(
        JSON.stringify({ error: "TikTok not connected for this tenant" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Page through TikTok video/list/
    const videoFields = [
      "id",
      "create_time",
      "cover_image_url",
      "share_url",
      "video_description",
      "duration",
      "title",
      "embed_link",
      "like_count",
      "comment_count",
      "share_count",
      "view_count",
    ];
    const all: unknown[] = [];
    let cursor: number | undefined = undefined;
    let hasMore = true;
    let pages = 0;
    while (hasMore && all.length < maxVideos && pages < 10) {
      const url = `${GATEWAY_URL}/video/list/?fields=${videoFields.join(",")}`;
      const pageBody: { max_count: number; cursor?: number } = {
        max_count: Math.min(20, maxVideos - all.length),
      };
      if (cursor !== undefined) pageBody.cursor = cursor;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TIKTOK_ACCESS_TOKEN}`,
          "X-Connection-Api-Key": TIKTOK_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pageBody),
      });
      const text = await res.text();
      if (!res.ok) {
        console.error("TikTok video/list failed", res.status, text);
        return new Response(
          JSON.stringify({
            error: "TikTok API error",
            status: res.status,
            details: text,
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const json: unknown = JSON.parse(text);
      all.push(...getArray(json, "data", "videos"));
      cursor = getNumber(json, "data", "cursor");
      hasMore = !!getPath(json, "data", "has_more");
      pages++;
    }

    const records: VideoRecord[] = all.slice(0, maxVideos).map((v) => {
      const views = Number(getPath(v, "view_count")) || 0;
      const likes = Number(getPath(v, "like_count")) || 0;
      const comments = Number(getPath(v, "comment_count")) || 0;
      const shares = Number(getPath(v, "share_count")) || 0;
      const engagement =
        views > 0 ? ((likes + comments + shares) / views) * 100 : 0;
      const createTime = getPath(v, "create_time");
      const createIso = createTime
        ? new Date(Number(createTime) * 1000).toISOString().split("T")[0]
        : "";
      return {
        video_id: String(getPath(v, "id") ?? ""),
        title: getString(v, "title") || getString(v, "video_description") || "",
        description: getString(v, "video_description") || "",
        create_time: createIso,
        cover_image_url: getString(v, "cover_image_url") || "",
        share_url: getString(v, "share_url") || "",
        embed_link: getString(v, "embed_link") || "",
        duration_sec: Number(getPath(v, "duration")) || 0,
        view_count: views,
        like_count: likes,
        comment_count: comments,
        share_count: shares,
        engagement_rate: Math.round(engagement * 100) / 100,
      };
    });

    // Fields definition
    const fieldKeys = [
      "create_time",
      "title",
      "view_count",
      "like_count",
      "comment_count",
      "share_count",
      "engagement_rate",
      "duration_sec",
      "cover_image_url",
      "share_url",
      "embed_link",
      "video_id",
      "description",
    ];
    const fieldNames = [
      "תאריך פרסום",
      "כותרת",
      "צפיות",
      "לייקים",
      "תגובות",
      "שיתופים",
      "שיעור מעורבות %",
      "משך (שניות)",
      "תמונה",
      "קישור",
      "הטמעה",
      "מזהה סרטון",
      "תיאור",
    ];
    const fieldTypes = [
      "date",
      "text",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "text",
      "text",
      "text",
      "text",
      "text",
    ];

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
            `[sync-tiktok-content] field insert ${fieldKeys[i]}:`,
            fieldErr.message,
          );
      }
    }

    // Replace records
    const { error: delErr } = await supabaseAdmin
      .from("crm_records")
      .delete()
      .eq("table_id", table_id)
      .eq("tenant_id", tableTenantId);
    if (delErr)
      console.error("[sync-tiktok-content] delete error:", delErr.message);

    let inserted = 0;
    if (records.length > 0) {
      const rows = records.map((r) => ({
        table_id,
        tenant_id: tableTenantId,
        created_by: userId,
        data: r,
      }));
      const { error: insErr, count } = await supabaseAdmin
        .from("crm_records")
        .insert(rows, { count: "exact" });
      if (insErr)
        console.error("[sync-tiktok-content] insert error:", insErr.message);
      else inserted = count ?? rows.length;
    }

    await supabaseAdmin
      .from("crm_tables")
      .update({
        integration_settings: {
          ...settings,
          last_sync_at: new Date().toISOString(),
        },
      })
      .eq("id", table_id);

    return new Response(
      JSON.stringify({
        success: true,
        records_synced: inserted,
        last_sync_at: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("sync-tiktok-content error:", error);
    return new Response(JSON.stringify({ error: getPath(error, "message") }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
