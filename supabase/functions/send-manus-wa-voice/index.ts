// Carmen voice notes over the Manus WA gateway — the REAL sender (probe done).
// Confirmed endpoint: POST {gateway}/api/v1/instances/{id}/send/file with
// { to, fileUrl, filename } (2026-07-24; other /send/* audio paths fall through
// to the SPA catch-all). Flow: TTS (OpenAI, ogg/opus) → public wa-voice bucket
// → gateway fetches by URL. The request rules are in handler.ts.
import { aiSpeak } from "../_shared/ai.ts";
import { type DbClient, serviceClient } from "../_shared/supabase-clients.ts";
import { createVoiceNoteHandler, type VoiceLine } from "./handler.ts";

const DEFAULT_GATEWAY = "https://whatsappgw-pzpyrrww.manus.space";
const BUCKET = "wa-voice";

const db = serviceClient();

Deno.serve(
  createVoiceNoteHandler({
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    loadLine: (tenantId) => loadLine(db, tenantId),
    speak: (text, voice) => aiSpeak(text, { voice, format: "opus" }),
    storeAudio: (tenantId, audio) => storeAudio(db, tenantId, audio),
    sendFile,
  }),
);

/** The tenant's oldest active Manus line, or null when none has a key and an instance. */
async function loadLine(
  sb: DbClient,
  tenantId: string,
): Promise<VoiceLine | null> {
  const { data: integ, error } = await sb
    .from("tenant_integrations")
    .select("id, tenant_id, api_key, settings")
    .eq("tenant_id", tenantId)
    .eq("integration_type", "manus_wa")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`tenant_integrations read failed: ${error.message}`);
  }
  return gatewayLine(integ);
}

/** The line's gateway fields, or null when its key or instance is missing. */
function gatewayLine(
  integ: {
    id: string;
    tenant_id: string;
    api_key: string | null;
    settings: unknown;
  } | null,
): VoiceLine | null {
  const settings =
    typeof integ?.settings === "object" && integ.settings !== null
      ? (integ.settings as Record<string, unknown>)
      : {};
  const instanceId = settings.instance_id;
  if (!integ?.api_key || typeof instanceId !== "string" || !instanceId) {
    return null;
  }
  return {
    id: integ.id,
    tenantId: integ.tenant_id,
    apiKey: integ.api_key,
    instanceId,
    gatewayUrl:
      typeof settings.gateway_url === "string" ? settings.gateway_url : null,
  };
}

/** Uploads the ogg/opus audio and returns its public URL for the gateway. */
async function storeAudio(
  sb: DbClient,
  tenantId: string,
  audio: Uint8Array,
): Promise<string> {
  await sb.storage
    .createBucket(BUCKET, { public: true })
    .catch((err: unknown) =>
      console.warn("[send-manus-wa-voice] createBucket", err),
    );
  const path = `${tenantId}/${crypto.randomUUID()}.ogg`;
  const up = await sb.storage.from(BUCKET).upload(path, audio, {
    contentType: "audio/ogg",
    upsert: true,
  });
  if (up.error) {
    throw new Error(`upload failed: ${up.error.message}`);
  }
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Posts the file to the line's gateway; false when the gateway rejects it. */
async function sendFile(
  line: VoiceLine,
  to: string,
  fileUrl: string,
): Promise<boolean> {
  const gateway = line.gatewayUrl || DEFAULT_GATEWAY;
  const r = await fetch(
    `${gateway}/api/v1/instances/${line.instanceId}/send/file`,
    {
      method: "POST",
      headers: { "X-Api-Key": line.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ to, fileUrl, filename: "carmen-voice.ogg" }),
    },
  );
  const bodyText = (await r.text()).slice(0, 300);
  // The gateway serves its SPA (HTML, 200) for unknown routes — treat as failure
  const isHtml = bodyText.trimStart().startsWith("<");
  if (!r.ok || isHtml) {
    console.error(
      "[send-manus-wa-voice] gateway rejected",
      r.status,
      bodyText.slice(0, 120),
    );
    return false;
  }
  return true;
}
