/**
 * What the tenant's connected keys let Carmen make. Pure and free of secrets: it only ever
 * reports which providers are connected, never the key values.
 */

import { higgsfieldCredential } from "./higgsfield-credential.ts";
import {
  engineFromKeys,
  ENGINE_LABEL,
  type VideoConnections,
} from "./video-cost.ts";

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
    higgsfield: higgsfieldCredential(
      settings.higgsfield_api_key_id,
      settings.higgsfield_api_key_secret,
    ).includes(":"),
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
  connections: VideoConnections = {},
) {
  const connected = connectedProviders(settings, env);
  const images = imageProvidersFor(connected);
  const engine = engineFromKeys(settings, connections);
  const brains = (["openai", "google", "anthropic"] as const).filter(
    (provider) => connected[provider],
  );
  // An OpenRouter brain also makes pictures and narrates (ElevenLabs voices through OpenRouter).
  const openRouter = connections.openrouter === true;
  const missing: string[] = [];
  if (images.length === 0 && !openRouter)
    missing.push(
      "אין מפתח ליצירת תמונות: צריך מוח OpenRouter או אחד מ-OpenAI, Google, ElevenLabs או Higgsfield",
    );
  if (!connected.elevenlabs && !connected.google && !openRouter)
    missing.push("בלי ElevenLabs, OpenRouter או Google אין קריינות");
  if (!connected.elevenlabs)
    missing.push(
      "בלי ElevenLabs אין מוזיקה (הסרט יורכב בלי מיטת מוזיקה) והנפשה במנוע ElevenLabs",
    );
  if (engine === "mock")
    missing.push(
      "אין מנוע וידאו אמיתי (ElevenLabs, Higgsfield או OpenRouter): הסרט יופק במנוע בדיקה",
    );
  // Carmen's own engine continues on the OpenRouter brain when no provider key answers.
  if (brains.length === 0 && !openRouter) missing.push("אין מפתח למודל שפה");
  return {
    connected,
    brains: [
      ...brains.map((provider) => PROVIDER_LABEL[provider]),
      ...(openRouter ? ["OpenRouter"] : []),
    ],
    can: {
      images: images.length > 0 || openRouter,
      image_providers: [
        ...(openRouter ? ["OpenRouter"] : []),
        ...images.map((provider) => PROVIDER_LABEL[provider]),
      ],
      video: engine !== "mock",
      video_engine: ENGINE_LABEL[engine],
      /** OpenRouter is connected as a Carmen brain and can also make video. */
      openrouter_video: connections.openrouter === true,
      narration: connected.elevenlabs || connected.google || openRouter,
      music: connected.elevenlabs,
    },
    missing,
  };
}
