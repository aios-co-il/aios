/**
 * One still image from whichever connected provider can make it. The first provider that works
 * wins; a provider that fails (billing, quota, unverified org) hands over to the next one, and
 * the final error says what each one answered.
 */

import { type GeminiAspectRatio } from "../creative/geminiImage.ts";
import { PROVIDER_LABEL, type Provider } from "./capabilities.ts";
import { viaElevenLabs } from "./image-elevenlabs.ts";
import { viaGoogle } from "./image-google.ts";
import { viaHiggsfield } from "./image-higgsfield.ts";
import { viaOpenAi } from "./image-openai.ts";

export type ImageProvider = Extract<
  Provider,
  "openai" | "google" | "elevenlabs" | "higgsfield"
>;
export type ImageKeys = Partial<Record<ImageProvider, string>>;

export const IMAGE_PROVIDER_ORDER: ImageProvider[] = [
  "openai",
  "google",
  "elevenlabs",
  "higgsfield",
];

/** Gemini-based models hold a character and style across references better than OpenAI image edits. */
export const REFERENCE_PROVIDER_ORDER: ImageProvider[] = [
  "google",
  "elevenlabs",
  "openai",
  "higgsfield",
];

export interface ImageReference {
  bytes: Uint8Array;
  mime: string;
  /** Where it came from; Higgsfield takes a public link instead of bytes. */
  url?: string;
}

const HTTP_TIMEOUT_MS = 100_000;

export interface ImageDeps {
  /** Use only this provider, with no fallback: the user chose it. */
  engine?: ImageProvider;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
  maxPolls?: number;
  gemini?: (input: {
    apiKey: string;
    prompt: string;
    images: Uint8Array[];
    mimeTypes?: string[];
    aspectRatio: GeminiAspectRatio;
  }) => Promise<{ bytes: Uint8Array }>;
}

export interface MadeImage {
  bytes: Uint8Array;
  mime: string;
  provider: ImageProvider;
}

const ASPECTS: GeminiAspectRatio[] = [
  "1:1",
  "16:9",
  "9:16",
  "4:5",
  "3:4",
  "4:3",
];

export const aspectFor = (value: unknown): GeminiAspectRatio =>
  ASPECTS.includes(value as GeminiAspectRatio)
    ? (value as GeminiAspectRatio)
    : "1:1";

export async function generateStill(
  keys: ImageKeys,
  prompt: string,
  aspectRatio: unknown,
  deps: ImageDeps = {},
  references: ImageReference[] = [],
): Promise<MadeImage> {
  const aspect = aspectFor(aspectRatio);
  const baseFetch = deps.fetchImpl ?? fetch;
  // A provider that never answers must fail with a reason, not hang the whole request.
  const fetchImpl: typeof fetch = (input, init) =>
    baseFetch(input, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  const order =
    references.length > 0 ? REFERENCE_PROVIDER_ORDER : IMAGE_PROVIDER_ORDER;
  if (deps.engine && !keys[deps.engine])
    throw new Error(
      `${PROVIDER_LABEL[deps.engine]} לא מחובר. בחרו מנוע אחר או חברו את המפתח בהגדרות מודלי AI.`,
    );
  const available = deps.engine
    ? [deps.engine]
    : order.filter((provider) => keys[provider]);
  if (available.length === 0)
    throw new Error(
      "אין מפתח ליצירת תמונות. מספיק אחד מ-OpenAI, Google, ElevenLabs או Higgsfield בהגדרות מודלי AI.",
    );
  const failures: string[] = [];
  for (const provider of available) {
    const key = keys[provider]!;
    try {
      if (provider === "openai")
        return await viaOpenAi(key, prompt, aspect, fetchImpl, references);
      if (provider === "google")
        return await viaGoogle(key, prompt, aspect, deps, references);
      if (provider === "higgsfield")
        return await viaHiggsfield(
          key,
          prompt,
          aspect,
          deps,
          fetchImpl,
          references,
        );
      return await viaElevenLabs(
        key,
        prompt,
        aspect,
        deps,
        fetchImpl,
        references,
      );
    } catch (error) {
      const message =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
          ? "לא ענה בזמן"
          : error instanceof Error
            ? error.message
            : String(error);
      failures.push(`${PROVIDER_LABEL[provider]}: ${message}`);
      // A timeout or an accepted job may still be charged: stop instead of paying a second engine.
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      if (timedOut || (error as { accepted?: boolean })?.accepted) break;
      // A pinned ElevenLabs choice on Starter still has to produce the picture.
      if (
        provider === "elevenlabs" &&
        /paid_plan_required|תוכנית pro/i.test(message)
      ) {
        for (const next of ["google", "higgsfield", "openai"] as const) {
          if (keys[next] && !available.includes(next)) available.push(next);
        }
      }
    }
  }
  throw new Error(
    failures.length === 1
      ? failures[0]
      : `יצירת התמונה נכשלה בכל הספקים המחוברים. ${failures.join(" | ")}`,
  );
}
