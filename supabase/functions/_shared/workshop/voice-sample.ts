/**
 * A short spoken sample of a narration voice, made once per tenant with the tenant's ElevenLabs
 * key (or the server's) and kept in the private creative-video bucket. The board signs the path.
 */

import { findVoice, sampleText } from "./voices.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const BUCKET = "creative-video";
const TTS_MODEL = "eleven_v3";

async function elevenLabsKey(supabase: Db, tenantId: string) {
  const { data } = await supabase
    .from("tenant_integrations")
    .select("settings")
    .eq("tenant_id", tenantId)
    .eq("integration_type", "llm")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const stored = String(data?.settings?.elevenlabs_api_key ?? "").trim();
  return stored || Deno.env.get("ELEVENLABS_API_KEY") || null;
}

export async function workshopVoiceSample(
  supabase: Db,
  tenantId: string,
  voiceId: string,
): Promise<{ path?: string; error?: string }> {
  const voice = findVoice(voiceId);
  if (!voice) return { error: "קול לא מוכר" };
  const folder = `${tenantId}/voices`;
  const path = `${folder}/${voice.id}.mp3`;
  const listed = await supabase.storage
    .from(BUCKET)
    .list(folder, { search: `${voice.id}.mp3` });
  if (Array.isArray(listed.data) && listed.data.length > 0) return { path };
  const key = await elevenLabsKey(supabase, tenantId);
  if (!key) return { error: "אין מפתח ElevenLabs" };
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text: sampleText(voice), model_id: TTS_MODEL }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok)
    return {
      error: `ElevenLabs ${response.status}: ${(await response.text()).slice(0, 200)}`,
    };
  const bytes = new Uint8Array(await response.arrayBuffer());
  const uploaded = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
  if (uploaded.error) return { error: uploaded.error.message };
  return { path };
}
