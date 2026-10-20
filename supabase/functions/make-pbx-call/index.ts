// Starts a call through the tenant's generic PBX: logs the call, then sends the
// PBX's outgoing webhook with caller number, destination number and extension.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildOutboundRequest,
  isAllowedOutboundUrl,
  resolveCaller,
  type PbxSettings,
} from "../_shared/pbx.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const {
      data: { user },
      error: authError,
    } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    ).auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { to_number, lead_id, client_id, tenant_id } = await req.json();
    if (!to_number || !tenant_id)
      return json(
        { error: "Missing required fields: to_number, tenant_id" },
        400,
      );

    const { data: membership } = await supabase
      .from("tenant_users")
      .select("user_id")
      .eq("tenant_id", tenant_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", {
        _user_id: user.id,
      });
      if (!isSuperAdmin) return json({ error: "Forbidden" }, 403);
    }

    const { data: integration } = await supabase
      .from("tenant_integrations")
      .select("id, settings")
      .eq("tenant_id", tenant_id)
      .eq("integration_type", "generic_pbx")
      .eq("is_active", true)
      .is("user_id", null)
      .maybeSingle();
    const settings = (integration?.settings || {}) as PbxSettings;
    if (!integration || !settings.outbound_url)
      return json(
        {
          error: "PBX not configured",
          message: "יש להגדיר את המרכזיה ואת כתובת ה-Webhook היוצא",
        },
        422,
      );
    if (!isAllowedOutboundUrl(settings.outbound_url))
      return json({ error: "PBX outbound URL is not allowed" }, 422);

    const { extension, callerNumber } = resolveCaller(settings, user.id);
    const callId = crypto.randomUUID();

    const { data: callLog, error: insertError } = await supabase
      .from("call_logs")
      .insert({
        tenant_id,
        lead_id: lead_id || null,
        client_id: client_id || null,
        caller_user_id: user.id,
        from_number: callerNumber,
        to_number,
        status: "initiated",
        provider: "pbx",
        provider_call_id: callId,
        notes: extension ? `שלוחה ${extension}` : null,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    const { url, init } = buildOutboundRequest(settings, {
      callerNumber,
      destinationNumber: to_number,
      extension,
      callId,
    });

    let ok = false;
    let detail = "";
    try {
      const res = await fetch(url, {
        ...init,
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
      ok = res.ok;
      detail = (await res.text()).slice(0, 500);
      if (!ok) detail = `HTTP ${res.status}: ${detail}`;
    } catch (e) {
      detail = (e as Error).message;
    }

    if (!ok) {
      await supabase
        .from("call_logs")
        .update({
          status: "failed",
          notes: [callLog.notes, `המרכזיה החזירה שגיאה: ${detail}`]
            .filter(Boolean)
            .join(" | "),
        })
        .eq("id", callLog.id);
      return json(
        {
          error: "PBX request failed",
          message: "המרכזיה לא קיבלה את בקשת החיוג",
          detail,
          call_log: { ...callLog, status: "failed" },
        },
        502,
      );
    }

    return json({ success: true, call_log: callLog, call_id: callId });
  } catch (error) {
    console.error("make-pbx-call error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
