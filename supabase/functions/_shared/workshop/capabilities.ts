/**
 * What the tenant's connected keys let Carmen make. Pure and free of secrets: it only ever
 * reports which providers are connected, never the key values.
 */

import { engineFromKeys, ENGINE_LABEL } from "./video-cost.ts";

export type Provider =
  "openai" | "google" | "anthropic" | "elevenlabs" | "higgsfield";

export const PROVIDER_LABEL: Record<Provider, string> = {
  openai: "OpenAI",
  google: "Google (Gemini)",
  anthropic: "Anthropic (Claude)",
  elevenlabs: "ElevenLabs",
  higgsfield: "Higgsfield",
};

const text = (settings: Record<string, unknown>, key: string) =>
  typeof settings[key] === "string" ? (settings[key] as string).trim() : "";

export function connectedProviders(
  settings: Record<string, unknown>,
  env: { openai?: string } = {},
): Record<Provider, boolean> {
  return {
    openai: !!text(settings, "openai_api_key") || !!env.openai?.trim(),
    google: !!text(settings, "google_api_key"),
    anthropic: !!text(settings, "anthropic_api_key"),
    elevenlabs: !!text(settings, "elevenlabs_api_key"),
    higgsfield:
      !!text(settings, "higgsfield_api_key_id") &&
      !!text(settings, "higgsfield_api_key_secret"),
  };
}

/** Image providers in the order Carmen tries them. */
export const imageProvidersFor = (connected: Record<Provider, boolean>) =>
  (["openai", "google", "elevenlabs", "higgsfield"] as const).filter(
    (provider) => connected[provider],
  );

export function capabilityReport(
  settings: Record<string, unknown>,
  env: { openai?: string } = {},
) {
  const connected = connectedProviders(settings, env);
  const images = imageProvidersFor(connected);
  const engine = engineFromKeys(settings);
  const brains = (["openai", "google", "anthropic"] as const).filter(
    (provider) => connected[provider],
  );
  const missing: string[] = [];
  if (images.length === 0)
    missing.push(
      "אין מפתח ליצירת תמונות: צריך אחד מ-OpenAI, Google, ElevenLabs או Higgsfield",
    );
  if (!connected.elevenlabs && !connected.google)
    missing.push("בלי ElevenLabs או Google אין קריינות");
  if (!connected.elevenlabs)
    missing.push("בלי ElevenLabs אין מוזיקה והנפשה במנוע ElevenLabs");
  if (engine === "mock")
    missing.push(
      "אין מנוע וידאו אמיתי (ElevenLabs או Higgsfield): הסרט יופק במנוע בדיקה",
    );
  if (brains.length === 0) missing.push("אין מפתח למודל שפה");
  return {
    connected,
    brains: brains.map((provider) => PROVIDER_LABEL[provider]),
    can: {
      images: images.length > 0,
      image_providers: images.map((provider) => PROVIDER_LABEL[provider]),
      video: engine !== "mock",
      video_engine: ENGINE_LABEL[engine],
      narration: connected.elevenlabs || connected.google,
      music: connected.elevenlabs,
    },
    missing,
  };
}
