import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getArray, getPath, getString } from "../_shared/provider-json-b24.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  let c = p.replace(/\D/g, "");
  if (c.startsWith("972")) c = "0" + c.slice(3);
  return c;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const {
      data: { user },
    } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    ).auth.getUser();
    if (!user)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });

    const { tenant_id, days = 7 } = await req.json();
    if (!tenant_id)
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400,
        headers: corsHeaders,
      });

    const { data: settings } = await supabase
      .from("maskyoo_settings")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!settings)
      return new Response(JSON.stringify({ error: "Maskyoo not configured" }), {
        status: 422,
        headers: corsHeaders,
      });

    // Build SQL query - last N days
    const sql = `SELECT id, start_call, end_call, call_duration, cdr_ani, cdr_ddi, onetouch, user_phone, user_name, cdr_uniqueid, call_status FROM webserviceview WHERE start_call >= DATE_SUB(NOW(), INTERVAL ${Number(days)} DAY) ORDER BY start_call DESC LIMIT 1000`;

    const baseUrl = settings.base_url.replace(/\/$/, "");
    const params = new URLSearchParams({
      service: "cdr_query",
      sql,
      format: "json",
    });
    const res = await fetch(`${baseUrl}/api/?${params.toString()}`, {
      headers: { Authorization: `Bearer ${settings.api_token}` },
    });
    const body = await res.text();
    let data: unknown = {};
    try {
      data = JSON.parse(body);
    } catch {
      data = { raw: body };
    }

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Maskyoo CDR query failed", details: data }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const rows = getArray(data, "result");
    let inserted = 0,
      updated = 0;

    for (const r of rows) {
      const uniqueid = getPath(r, "cdr_uniqueid");
      if (!uniqueid) continue;

      // Try match existing log by provider_call_id
      const { data: existing } = await supabase
        .from("call_logs")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("provider", "maskyoo")
        .eq("provider_call_id", uniqueid)
        .maybeSingle();

      // Try match lead/client by phone
      const cdrAni = getString(r, "cdr_ani");
      const cdrDdi = getString(r, "cdr_ddi");
      const callerPhone = normalizePhone(cdrAni);
      const calleePhone = normalizePhone(cdrDdi);
      const targetPhone = calleePhone || callerPhone;
      let lead_id: string | null = null;
      let client_id: string | null = null;
      if (targetPhone) {
        const last9 = targetPhone.slice(-9);
        const { data: lead } = await supabase
          .from("leads")
          .select("id")
          .eq("tenant_id", tenant_id)
          .ilike("phone", `%${last9}`)
          .maybeSingle();
        if (lead) lead_id = lead.id;
        if (!lead_id) {
          const { data: client } = await supabase
            .from("clients")
            .select("id")
            .eq("tenant_id", tenant_id)
            .ilike("phone", `%${last9}`)
            .maybeSingle();
          if (client) client_id = client.id;
        }
      }

      const callStatus = getPath(r, "call_status");
      const callDuration = getPath(r, "call_duration");
      const status =
        callStatus === "ANSWERED"
          ? "completed"
          : callStatus === "NO ANSWER"
            ? "no-answer"
            : callStatus === "BUSY"
              ? "busy"
              : callStatus === "FAILED"
                ? "failed"
                : "completed";

      const payload = {
        tenant_id,
        provider: "maskyoo",
        provider_call_id: uniqueid,
        from_number: cdrAni || null,
        to_number: cdrDdi || null,
        duration: callDuration ? parseInt(String(callDuration)) : null,
        status,
        notes: `Maskyoo: ${getPath(r, "user_name") || ""} (${getPath(r, "user_phone") || ""}) [${callStatus}]`,
        lead_id,
        client_id,
      };

      if (existing) {
        await supabase.from("call_logs").update(payload).eq("id", existing.id);
        updated++;
      } else {
        await supabase.from("call_logs").insert(payload);
        inserted++;
      }
    }

    await supabase
      .from("maskyoo_settings")
      .update({ last_cdr_sync_at: new Date().toISOString() })
      .eq("tenant_id", tenant_id);

    return new Response(
      JSON.stringify({ success: true, total: rows.length, inserted, updated }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("sync-maskyoo-cdr error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
