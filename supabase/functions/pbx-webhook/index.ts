// Public webhook for the tenant's generic PBX. Receives call events and call
// recordings (a URL or an uploaded file) and attaches them to the lead whose
// phone matches the call.
// URL: /functions/v1/pbx-webhook?tenant_id=<UUID>&secret=<SECRET>
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  leadPhoneCandidates,
  mapCallStatus,
  parsePbxEvent,
  phoneLikePattern,
  phoneMatchKey,
  secretsMatch,
  type PbxSettings,
} from "../_shared/pbx.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MAX_RECORDING_BYTES = 50 * 1024 * 1024;
const FILE_FIELDS = ["recording_file", "recording", "file", "audio"];
const AUDIO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/gsm": "gsm",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET")
    return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const url = new URL(req.url);

    const params: Record<string, unknown> = {};
    let recordingFile: File | null = null;
    if (req.method === "POST") {
      const ct = req.headers.get("content-type") || "";
      try {
        if (ct.includes("application/json")) {
          Object.assign(params, await req.json());
        } else if (ct.includes("multipart/form-data") || ct.includes("form")) {
          const fd = await req.formData();
          fd.forEach((v, k) => {
            if (typeof v === "string") params[k] = v;
            else if (!recordingFile && FILE_FIELDS.includes(k))
              recordingFile = v as File;
          });
        } else {
          const text = await req.text();
          if (text.trim().startsWith("{"))
            Object.assign(params, JSON.parse(text));
          else if (text.includes("="))
            new URLSearchParams(text).forEach((v, k) => (params[k] = v));
        }
      } catch {
        return json({ error: "Could not parse request body" }, 400);
      }
    }
    // Query string wins so tenant_id / secret in the URL cannot be overridden.
    url.searchParams.forEach((v, k) => (params[k] = v));

    const tenantId = String(params.tenant_id || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(tenantId))
      return json({ error: "tenant_id required" }, 400);

    const { data: integration } = await supabase
      .from("tenant_integrations")
      .select("id, settings, is_active")
      .eq("tenant_id", tenantId)
      .eq("integration_type", "generic_pbx")
      .is("user_id", null)
      .maybeSingle();
    const settings = (integration?.settings || {}) as PbxSettings;
    if (!integration || !integration.is_active || !settings.inbound_secret)
      return json({ error: "PBX not configured for tenant" }, 404);

    const providedSecret =
      req.headers.get("x-webhook-secret") || String(params.secret || "");
    if (!secretsMatch(settings.inbound_secret, providedSecret))
      return json({ error: "Invalid secret" }, 403);

    const event = parsePbxEvent(params);

    // Store an uploaded recording file and use its URL.
    let recordingUrl = event.recordingUrl;
    const file = recordingFile as File | null;
    if (file && file.size > 0) {
      if (file.size > MAX_RECORDING_BYTES)
        return json({ error: "Recording file too large (max 50MB)" }, 413);
      const type = (file.type || "").toLowerCase();
      const nameExt = (file.name.split(".").pop() || "").toLowerCase();
      const ext =
        AUDIO_EXT[type] ||
        (/^(mp3|wav|ogg|webm|m4a|aac|gsm)$/.test(nameExt) ? nameExt : null);
      if (!ext) return json({ error: "Recording must be an audio file" }, 415);
      const path = `pbx/${tenantId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("recordings")
        .upload(path, file, { contentType: type || `audio/${ext}` });
      if (uploadError) {
        console.error("pbx-webhook upload error:", uploadError);
        return json({ error: "Failed to store recording" }, 500);
      }
      recordingUrl = supabase.storage.from("recordings").getPublicUrl(path)
        .data.publicUrl;
    }
    if (recordingUrl && !/^https?:\/\//i.test(recordingUrl))
      return json({ error: "recording_url must be an http(s) URL" }, 400);

    // 1) The call this event belongs to (call_id we sent, or the PBX's id).
    let existing: Record<string, any> | null = null;
    if (event.callId) {
      const { data } = await supabase
        .from("call_logs")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("provider", "pbx")
        .eq("provider_call_id", event.callId)
        .maybeSingle();
      existing = data;
    }

    // 2) The lead (or client) whose phone matches the call.
    let leadId: string | null = existing?.lead_id ?? null;
    let clientId: string | null = existing?.client_id ?? null;
    if (!leadId && !clientId) {
      for (const key of leadPhoneCandidates(event)) {
        // Phones are stored in many formats ("050-123-4567", "+972 50…"), so
        // fetch loose matches and confirm on the normalized digits.
        const pattern = phoneLikePattern(key);
        const { data: leads } = await supabase
          .from("leads")
          .select("id, phone")
          .eq("tenant_id", tenantId)
          .ilike("phone", pattern)
          .order("created_at", { ascending: false })
          .limit(20);
        const lead = (leads || []).find((l) => phoneMatchKey(l.phone) === key);
        if (lead) {
          leadId = lead.id;
          break;
        }
        const { data: clients } = await supabase
          .from("clients")
          .select("id, phone")
          .eq("tenant_id", tenantId)
          .ilike("phone", pattern)
          .limit(20);
        const client = (clients || []).find(
          (c) => phoneMatchKey(c.phone) === key,
        );
        if (client) {
          clientId = client.id;
          break;
        }
      }
    }

    // 3) Unknown call: attach the recording to the lead's latest call without one
    //    (e.g. a call started from the CRM when the PBX does not echo call_id).
    if (!existing && recordingUrl && (leadId || clientId)) {
      const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      let q = supabase
        .from("call_logs")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("provider", "pbx")
        .is("recording_url", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      q = leadId ? q.eq("lead_id", leadId) : q.eq("client_id", clientId!);
      const { data } = await q.maybeSingle();
      existing = data;
    }

    const mappedUser = (settings.extensions || []).find(
      (e) => event.extension && e.extension === event.extension,
    )?.user_id;

    const status = event.status
      ? mapCallStatus(event.status)
      : recordingUrl
        ? "completed"
        : (existing?.status ?? "completed");

    if (existing) {
      const update: Record<string, unknown> = { status };
      if (!existing.lead_id && leadId) update.lead_id = leadId;
      if (!existing.client_id && clientId) update.client_id = clientId;
      if (event.duration !== null) update.duration = event.duration;
      if (recordingUrl) {
        update.recording_url = recordingUrl;
        if (event.duration !== null) update.recording_duration = event.duration;
      }
      const { error } = await supabase
        .from("call_logs")
        .update(update)
        .eq("id", existing.id);
      if (error) throw error;
      return json({
        ok: true,
        call_log_id: existing.id,
        lead_id: (update.lead_id as string) ?? existing.lead_id,
        client_id: (update.client_id as string) ?? existing.client_id,
        matched: !!(leadId || clientId),
      });
    }

    let callerUserId = mappedUser || null;
    if (!callerUserId) {
      const { data: tenantUser } = await supabase
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      callerUserId = tenantUser?.user_id ?? null;
    }
    if (!callerUserId) return json({ error: "No tenant user found" }, 422);

    const notes = [
      event.direction === "inbound"
        ? "שיחה נכנסת"
        : event.direction === "outbound"
          ? "שיחה יוצאת"
          : null,
      event.extension ? `שלוחה ${event.extension}` : null,
      settings.name ? `מרכזיה: ${settings.name}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const { data: created, error: insertError } = await supabase
      .from("call_logs")
      .insert({
        tenant_id: tenantId,
        lead_id: leadId,
        client_id: clientId,
        caller_user_id: callerUserId,
        from_number: event.caller,
        to_number: event.called || event.caller || "unknown",
        status,
        duration: event.duration ?? 0,
        recording_url: recordingUrl,
        recording_duration: recordingUrl ? event.duration : null,
        provider: "pbx",
        provider_call_id: event.callId,
        notes: notes || null,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    return json({
      ok: true,
      call_log_id: created.id,
      lead_id: leadId,
      client_id: clientId,
      matched: !!(leadId || clientId),
    });
  } catch (error) {
    console.error("pbx-webhook error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
