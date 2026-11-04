/**
 * Picks the scene engine a tenant can run from its connected keys and brain connections.
 */

import { higgsfieldCredential } from "./higgsfield-credential.ts";
import { type SceneEngine, type VideoConnections } from "./scene-engine.ts";

/**
 * Picks a scene engine the account can run: the OpenRouter brain when connected, then ElevenLabs
 * video (it needs Pro), then Higgsfield, otherwise the free preview.
 */
export async function sceneEngineFor(
  settings: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
  connections: VideoConnections = {},
): Promise<SceneEngine> {
  if (connections.openrouter) return "openrouter";
  const fallback: SceneEngine = higgsfieldReady(settings)
    ? "higgsfield"
    : "mock";
  const elevenKey = hasKey(settings, "elevenlabs_api_key")
    ? String(settings.elevenlabs_api_key).trim()
    : "";
  if (elevenKey) {
    const allowed = await elevenLabsMediaAllowed(elevenKey, fetchImpl);
    if (allowed !== false) return "elevenlabs";
  }
  return fallback;
}

/**
 * The engine the tenant can actually use: its own ElevenLabs or Higgsfield keys, then an
 * OpenRouter brain connection, else the free preview.
 */
export function engineFromKeys(
  settings: Record<string, unknown>,
  connections: VideoConnections = {},
): SceneEngine {
  const has = (key: string) =>
    typeof settings[key] === "string" &&
    (settings[key] as string).trim() !== "";
  // The tenant's OpenRouter brain comes first: David chose it for video (Kling, Veo, Seedance).
  if (connections.openrouter) return "openrouter";
  if (has("elevenlabs_api_key")) return "elevenlabs";
  if (higgsfieldReady(settings)) return "higgsfield";
  return "mock";
}

const higgsfieldReady = (settings: Record<string, unknown>) =>
  higgsfieldCredential(
    settings.higgsfield_api_key_id,
    settings.higgsfield_api_key_secret,
  ).includes(":");

const hasKey = (settings: Record<string, unknown>, key: string) =>
  typeof settings[key] === "string" && (settings[key] as string).trim() !== "";

/** Image and video generation on ElevenLabs starts at Pro. Starter and free stay on Higgsfield. */
export function elevenLabsTierAllowsMedia(tier: unknown): boolean {
  const name = String(tier ?? "").toLowerCase();
  return (
    name === "pro" ||
    name === "creator" ||
    name === "scale" ||
    name === "business" ||
    name === "enterprise"
  );
}

/** null means the subscription could not be read, so a Pro account is not dropped on a blip. */
export async function elevenLabsMediaAllowed(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean | null> {
  try {
    const response = await fetchImpl(
      "https://api.elevenlabs.io/v1/user/subscription",
      { headers: { "xi-api-key": apiKey } },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const tier =
      (data as { tier?: unknown; subscription?: { tier?: unknown } }).tier ??
      (data as { subscription?: { tier?: unknown } }).subscription?.tier;
    return elevenLabsTierAllowsMedia(tier);
  } catch {
    return null;
  }
}
