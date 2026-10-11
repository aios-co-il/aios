// Re-issue a Recall download URL for a meeting-bot recording that was too
// large to copy into Storage. Recall's S3 signature lasts a few hours; the
// row keeps the last URL, so playback has to ask Recall again.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { corsHeaders } from "../_shared/cors.ts";
import { extractRecallDownloads, retrieveRecallBot } from "../_shared/recall.ts";

const headers = { ...corsHeaders, "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecallHost(url: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("recallai") || host.endsWith("recall.ai");
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "חסרה הזדהות" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "אין הרשאה" }, 401);

    const body = await req.json().catch(() => ({}));
    const recordingId = body?.recording_id;
    if (typeof recordingId !== "string" || !UUID.test(recordingId)) {
      return json({ error: "הקלטה לא תקינה" }, 400);
    }

    const { data: rec, error: recError } = await supabase
      .from("zoom_recordings")
      .select("id, source, meeting_id, recording_url, recording_type")
      .eq("id", recordingId)
      .maybeSingle();
    if (recError) throw recError;
    if (!rec) return json({ error: "ההקלטה לא נמצאה" }, 404);
    if ((rec.source !== "meeting_bot" && !isRecallHost(rec.recording_url)) || !rec.meeting_id) {
      return json({ error: "אין מקור Recall להקלטה הזו" }, 422);
    }

    const bot = await retrieveRecallBot(String(rec.meeting_id));
    const { videoUrl, audioUrl } = extractRecallDownloads(bot);
    const url = rec.recording_type === "audio_only" ? (audioUrl || videoUrl) : (videoUrl || audioUrl);
    if (!url) return json({ error: "אין קובץ וידאו זמין אצל Recall" }, 404);

    const { error: updateError } = await supabase
      .from("zoom_recordings")
      .update({ recording_url: url })
      .eq("id", rec.id);
    if (updateError) console.error("[refresh-recording-playback] url persist failed", rec.id, updateError.message);

    return json({ url });
  } catch (error) {
    console.error("[refresh-recording-playback]", error instanceof Error ? error.message : "refresh_failed");
    return json({ error: "לא הצלחנו לחדש את קישור ההקלטה. נסה שוב." }, 500);
  }
});
