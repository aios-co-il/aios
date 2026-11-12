// redeploy trigger: rebundle _shared/meeting-summary.ts (rich summary structure + summary_md persistence)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AiHttpError } from "../_shared/meeting-summary.ts";
import { dispatchMeetingSummaryToCursor } from "../_shared/meeting-summary-cursor.ts";
import { resolveOpenAIKey } from "../_shared/ai.ts";
import { cursorSummaryResponse } from "./cursor-outcome.ts";
import { callerMayUseTenant } from "./caller-access.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import {
  type WriteSummaryInput,
  writeSummary,
  writeSummaryInBackground,
} from "./write-summary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const {
      recording_id,
      transcript,
      focus_points,
      custom_focus,
      target_type,
      target_id,
      tenant_id,
    } = await req.json();

    if (!(await callerMayUseTenant(serviceClient(), tenant_id, user.id))) {
      console.warn("[summarize-recording] caller outside tenant", {
        userId: user.id,
        tenantId: tenant_id,
      });
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!transcript || !transcript.trim()) {
      throw new Error("נא להזין תמלול או הערות מהפגישה");
    }

    const validTargetTypes = new Set([
      "client",
      "lead",
      "campaigner",
      "agency",
    ]);
    if (!validTargetTypes.has(target_type) || !target_id) {
      throw new Error("נא לבחור לקוח, ליד, איש צוות או סוכנות לשיוך הסיכום");
    }

    // Get recording info
    let recordingInfo = "";
    if (recording_id) {
      const { data: rec } = await supabase
        .from("zoom_recordings")
        .select("meeting_topic, start_time, duration, host_email")
        .eq("id", recording_id)
        .maybeSingle();
      if (rec) {
        recordingInfo = `נושא הפגישה: ${rec.meeting_topic || "לא צוין"}
תאריך: ${rec.start_time ? new Date(rec.start_time).toLocaleDateString("he-IL") : "לא צוין"}
משך: ${rec.duration ? rec.duration + " דקות" : "לא צוין"}
מארח: ${rec.host_email || "לא צוין"}`;
      }
    }

    // Build focus points prompt
    const focusLabels: Record<string, string> = {
      decisions: "החלטות שהתקבלו",
      action_items: "משימות ופעולות נדרשות",
      pain_points: "נקודות כאב של הלקוח",
      pricing: "הצעות מחיר ותמחור",
      next_steps: "שלבים הבאים",
      key_quotes: "ציטוטים מרכזיים",
    };

    let focusPrompt = "";
    if (focus_points && focus_points.length > 0) {
      const labels = focus_points
        .map((fp: string) => focusLabels[fp] || fp)
        .join(", ");
      focusPrompt = `\n\nדגשים מיוחדים שיש להתמקד בהם: ${labels}`;
    }
    if (custom_focus && custom_focus.trim()) {
      focusPrompt += `\nדגשים נוספים מהמשתמש: ${custom_focus}`;
    }

    // Get target name for the filename
    let targetName = "";
    let targetAgencyId: string | null = null;
    if (target_type === "client") {
      const { data } = await supabase
        .from("clients")
        .select("name")
        .eq("id", target_id)
        .maybeSingle();
      targetName = data?.name || "";
    } else if (target_type === "lead") {
      const { data } = await supabase
        .from("leads")
        .select("company_name")
        .eq("id", target_id)
        .maybeSingle();
      targetName = data?.company_name || "";
    } else if (target_type === "campaigner") {
      const { data } = await supabase
        .from("campaigners")
        .select("full_name")
        .eq("id", target_id)
        .eq("tenant_id", tenant_id)
        .maybeSingle();
      targetName = data?.full_name || "";
      const { data: agency } = await supabase
        .from("agencies")
        .select("id")
        .eq("tenant_id", tenant_id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      targetAgencyId = agency?.id || null;
    } else if (target_type === "agency") {
      const { data } = await supabase
        .from("agencies")
        .select("name")
        .eq("id", target_id)
        .eq("tenant_id", tenant_id)
        .maybeSingle();
      targetName = data?.name || "";
      targetAgencyId = target_id;
    }
    if (!targetName) throw new Error("יעד הסיכום לא נמצא או אינו נגיש");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const dispatched = recording_id
      ? await dispatchMeetingSummaryToCursor(admin, {
          tenantId: tenant_id,
          userId: user.id,
          recordingId: recording_id,
          transcript,
          recordingInfo,
          focusPrompt,
          targetType: target_type,
          targetId: target_id,
          targetName,
          clientId: target_type === "client" ? target_id : null,
          briefSource: "zoom_meeting",
          createdBy: user.id,
          manual: true,
        })
      : { ok: false as const, reason: "not_configured" as const };
    const cursorResponse = cursorSummaryResponse(dispatched, corsHeaders);
    if (cursorResponse) return cursorResponse;

    const OPENAI_API_KEY = await resolveOpenAIKey();
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const summaryInput: WriteSummaryInput = {
      openaiKey: OPENAI_API_KEY,
      tenantId: tenant_id,
      userId: user.id,
      recordingId: recording_id ?? null,
      transcript,
      recordingInfo,
      focusPrompt,
      targetType: target_type,
      targetId: target_id,
      targetName,
      targetAgencyId,
    };

    // A recording's summary is written after the reply: a long meeting takes
    // longer than the gateway waits (AIO-581). The UI polls the recording.
    if (recording_id) {
      writeSummaryInBackground(summaryInput);
      return new Response(
        JSON.stringify({ success: true, pending: true, channel: "model" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    try {
      const written = await writeSummary(summaryInput);
      return new Response(
        JSON.stringify({
          success: true,
          summary: written.summary,
          file_url: written.fileUrl,
          file_name: written.fileName,
          marketing_brief_created: written.marketingBriefCreated,
          marketing_work_item_id: written.marketingWorkItemId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (err) {
      if (err instanceof AiHttpError) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: err.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw err;
    }
  } catch (error) {
    console.error("Error:", error);
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
