/**
 * One still image from whichever connected provider can make it. The first provider that works
 * wins; a provider that fails (billing, quota, unverified org) hands over to the next one, and
 * the final error says what each one answered.
 */

import {
  generateGeminiImage,
  type GeminiAspectRatio,
} from "../creative/geminiImage.ts";
import { PROVIDER_LABEL, type Provider } from "./capabilities.ts";

export type ImageProvider = Extract<
  Provider,
  "openai" | "google" | "elevenlabs"
>;
export type ImageKeys = Partial<Record<ImageProvider, string>>;

export const IMAGE_PROVIDER_ORDER: ImageProvider[] = [
  "openai",
  "google",
  "elevenlabs",
];

export interface ImageDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
  maxPolls?: number;
  gemini?: (input: {
    apiKey: string;
    prompt: string;
    images: Uint8Array[];
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

const openAiSize = (aspect: GeminiAspectRatio) =>
  aspect === "16:9" || aspect === "4:3"
    ? "1536x1024"
    : aspect === "9:16" || aspect === "4:5" || aspect === "3:4"
      ? "1024x1536"
      : "1024x1024";

const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const clip = (value: string) => value.replace(/\s+/g, " ").slice(0, 220);

async function viaOpenAi(
  key: string,
  prompt: string,
  aspect: GeminiAspectRatio,
  fetchImpl: typeof fetch,
): Promise<MadeImage> {
  const response = await fetchImpl(
    "https://api.openai.com/v1/images/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: openAiSize(aspect),
        output_format: "png",
      }),
    },
  );
  if (!response.ok)
    throw new Error(`${response.status} ${clip(await response.text())}`);
  const data = await response.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("לא הוחזרה תמונה");
  return { bytes: fromBase64(b64), mime: "image/png", provider: "openai" };
}

async function viaGoogle(
  key: string,
  prompt: string,
  aspect: GeminiAspectRatio,
  deps: ImageDeps,
): Promise<MadeImage> {
  const made = await (deps.gemini ?? generateGeminiImage)({
    apiKey: key,
    prompt,
    images: [],
    aspectRatio: aspect,
  });
  return { bytes: made.bytes, mime: "image/png", provider: "google" };
}

async function viaElevenLabs(
  key: string,
  prompt: string,
  aspect: GeminiAspectRatio,
  deps: ImageDeps,
  fetchImpl: typeof fetch,
): Promise<MadeImage> {
  const headers = { "xi-api-key": key, "Content-Type": "application/json" };
  const base = "https://api.elevenlabs.io/v1/flows/image";
  const submit = await fetchImpl(base, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model_id: "gemini-3-pro-image",
      prompt,
      aspect_ratio: aspect,
      resolution: "1K",
    }),
  });
  const started = await submit.json().catch(() => ({}));
  if (!submit.ok || !started?.id)
    throw new Error(`${submit.status} ${clip(JSON.stringify(started))}`);
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const polls = deps.maxPolls ?? 40;
  for (let attempt = 0; attempt < polls; attempt++) {
    await sleep(deps.pollMs ?? 2000);
    const poll = await fetchImpl(`${base}/${encodeURIComponent(started.id)}`, {
      headers,
    });
    const state = await poll.json().catch(() => ({}));
    if (!poll.ok)
      throw new Error(`${poll.status} ${clip(JSON.stringify(state))}`);
    if (state.status === "failed")
      throw new Error(
        clip(String(state.error_message ?? state.failure_reason ?? "נכשל")),
      );
    if (state.status === "completed") {
      if (!state.content_url) throw new Error("לא הוחזר קישור לתמונה");
      const file = await fetchImpl(state.content_url);
      if (!file.ok) throw new Error(`הורדה ${file.status}`);
      return {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mime: file.headers.get("content-type")?.split(";")[0] || "image/png",
        provider: "elevenlabs",
      };
    }
  }
  throw new Error("הזמן אזל");
}

export async function generateStill(
  keys: ImageKeys,
  prompt: string,
  aspectRatio: unknown,
  deps: ImageDeps = {},
): Promise<MadeImage> {
  const aspect = aspectFor(aspectRatio);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const available = IMAGE_PROVIDER_ORDER.filter((provider) => keys[provider]);
  if (available.length === 0)
    throw new Error(
      "אין מפתח ליצירת תמונות. מספיק אחד מ-OpenAI, Google או ElevenLabs בהגדרות מודלי AI.",
    );
  const failures: string[] = [];
  for (const provider of available) {
    const key = keys[provider]!;
    try {
      if (provider === "openai")
        return await viaOpenAi(key, prompt, aspect, fetchImpl);
      if (provider === "google")
        return await viaGoogle(key, prompt, aspect, deps);
      return await viaElevenLabs(key, prompt, aspect, deps, fetchImpl);
    } catch (error) {
      failures.push(
        `${PROVIDER_LABEL[provider]}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw new Error(
    `יצירת התמונה נכשלה בכל הספקים המחוברים. ${failures.join(" | ")}`,
  );
}
