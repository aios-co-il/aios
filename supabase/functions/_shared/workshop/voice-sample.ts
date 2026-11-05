/**
 * A short spoken sample of a narration voice, made once per tenant with the tenant's ElevenLabs
 * key (or the server's) and kept in the private creative-video bucket. The board signs the path.
 * Without a working ElevenLabs key the same voice is spoken through the tenant's OpenRouter
 * brain, which hosts ElevenLabs speech.
 */

import { tenantOpenRouterKey } from "../creative/openrouterImage.ts";
import { findVoice, sampleText, type Voice } from "./voices.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const BUCKET = "creative-video";
const TTS_MODEL = "eleven_v3";
const OPENROUTER_TTS_MODEL = "elevenlabs/eleven-v3";

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

/** The sample's mp3 from ElevenLabs, else from ElevenLabs through OpenRouter. */
export async function sampleSpeech(
  voice: Voice,
  keys: {
    elevenLabs: string | null;
    openRouter: () => Promise<string | null>;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ bytes?: Uint8Array; error?: string }> {
  const failures: string[] = [];
  /** One speech request's mp3, or null with why it failed (a timeout included). */
  const speak = async (label: string, url: string, init: RequestInit) => {
    try {
      const response = await fetchImpl(url, {
        ...init,
        method: "POST",
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      failures.push(
        `${label} ${response.status}: ${(await response.text()).slice(0, 200)}`,
      );
    } catch (error) {
      failures.push(
        `${label}: ${error instanceof Error ? error.message : error}`,
      );
    }
    return null;
  };
  const direct = keys.elevenLabs
    ? await speak(
        "ElevenLabs",
        `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=mp3_44100_128`,
        {
          headers: {
            "xi-api-key": keys.elevenLabs,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: sampleText(voice),
            model_id: TTS_MODEL,
          }),
        },
      )
    : (failures.push("אין מפתח ElevenLabs"), null);
  if (direct) return { bytes: direct };
  const openRouter = await keys.openRouter().catch(() => null);
  if (!openRouter) return { error: failures.join(" | ") };
  const routed = await speak(
    "OpenRouter",
    "https://openrouter.ai/api/v1/audio/speech",
    {
      headers: {
        Authorization: `Bearer ${openRouter}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_TTS_MODEL,
        input: sampleText(voice),
        voice: voice.id,
        response_format: "mp3",
      }),
    },
  );
  return routed ? { bytes: routed } : { error: failures.join(" | ") };
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
  const spoken = await sampleSpeech(voice, {
    elevenLabs: await elevenLabsKey(supabase, tenantId),
    openRouter: () => tenantOpenRouterKey(supabase, tenantId),
  });
  if (!spoken.bytes) return { error: spoken.error };
  const uploaded = await supabase.storage
    .from(BUCKET)
    .upload(path, spoken.bytes, { contentType: "audio/mpeg", upsert: true });
  if (uploaded.error) return { error: uploaded.error.message };
  return { path };
}
