import type { ElevenLabsVoice } from "./elevenlabs-voices.ts";

/** What the app needs to open Carmen's ElevenLabs conversation. */
export type ElevenLabsSession = {
  provider: "elevenlabs";
  /** Short-lived WebSocket URL; the API key never reaches the phone. */
  signed_url: string;
  /** Sent back by the app as the conversation's overrides (agent Security → Overrides). */
  prompt: string;
  first_message: string;
  language: string;
  voice: { id: string; label: string };
  voice_id: string;
};

/** Why a session could not be minted; the app falls back to OpenAI on every one. */
export type ElevenLabsRefusal =
  | { ok: false; status: 503; error: "elevenlabs_not_configured" }
  | { ok: false; status: 502; error: "elevenlabs_session_failed" };

/** Where the session comes from: the agent and key of this environment (env secrets). */
export type ElevenLabsConfig = { apiKey: string; agentId: string };

const SIGNED_URL_ENDPOINT =
  "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url";

// The same opening line as the OpenAI session's greeting, then Carmen waits.
const FIRST_MESSAGE = "כן, אני מקשיבה";

const LOG = "[carmen-realtime-session]";

/**
 * The environment's ElevenLabs agent and key: `ELEVENLABS_CARMEN_AGENT_ID` and
 * `ELEVENLABS_API_KEY`. Null when either is missing, so that environment stays on OpenAI.
 */
export function elevenLabsConfig(
  env: (name: string) => string | undefined,
): ElevenLabsConfig | null {
  const apiKey = env("ELEVENLABS_API_KEY")?.trim();
  const agentId = env("ELEVENLABS_CARMEN_AGENT_ID")?.trim();
  return apiKey && agentId ? { apiKey, agentId } : null;
}

/**
 * Mints a signed conversation URL for Carmen's agent and returns it with the persona the
 * app sends as overrides. Tools are not part of it: ElevenLabs keeps client tools on the
 * agent itself, so the agent must declare the tools the app handles.
 */
export async function mintElevenLabsSession(
  config: ElevenLabsConfig | null,
  instructions: string,
  voice: ElevenLabsVoice,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; session: ElevenLabsSession } | ElevenLabsRefusal> {
  if (!config) {
    return { ok: false, status: 503, error: "elevenlabs_not_configured" };
  }
  const signedUrl = await fetchSignedUrl(config, fetcher);
  if (!signedUrl) {
    return { ok: false, status: 502, error: "elevenlabs_session_failed" };
  }
  return {
    ok: true,
    session: {
      provider: "elevenlabs",
      signed_url: signedUrl,
      prompt: instructions,
      first_message: FIRST_MESSAGE,
      language: "he",
      voice: { id: voice.id, label: voice.label },
      voice_id: voice.voiceId,
    },
  };
}

/** The signed URL, or null after logging why ElevenLabs refused or failed. */
async function fetchSignedUrl(
  config: ElevenLabsConfig,
  fetcher: typeof fetch,
): Promise<string | null> {
  try {
    const url = `${SIGNED_URL_ENDPOINT}?agent_id=${encodeURIComponent(config.agentId)}`;
    const response = await fetcher(url, {
      headers: { "xi-api-key": config.apiKey },
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      console.error(
        `${LOG} elevenlabs signed url failed`,
        response.status,
        detail,
      );
      return null;
    }
    const body = await response.json();
    const signedUrl = body?.signed_url;
    if (typeof signedUrl === "string" && signedUrl.startsWith("wss://")) {
      return signedUrl;
    }
    console.error(`${LOG} elevenlabs signed url missing in response`);
    return null;
  } catch (e) {
    console.error(
      `${LOG} elevenlabs signed url request failed`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}
