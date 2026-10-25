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

const REFERENCE_MIMES = ["image/jpeg", "image/png", "image/webp"];
const HTTP_TIMEOUT_MS = 100_000;
const REFERENCE_MAX_BYTES = 12 * 1024 * 1024;

export const sniffMime = (bytes: Uint8Array) =>
  bytes[0] === 0x89 && bytes[1] === 0x50
    ? "image/png"
    : bytes[0] === 0xff && bytes[1] === 0xd8
      ? "image/jpeg"
      : bytes[0] === 0x52 && bytes[8] === 0x57
        ? "image/webp"
        : null;

/**
 * Downloads reference images. Pictures that cannot be read are reported, never skipped silently:
 * a result that ignores the reference is the failure this exists to prevent.
 */
export async function loadReferences(
  urls: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ references: ImageReference[]; failed: string[] }> {
  const references: ImageReference[] = [];
  const failed: string[] = [];
  await Promise.all(
    urls.map(async (url, index) => {
      try {
        const response = await fetchImpl(url);
        if (!response.ok) throw new Error(String(response.status));
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length === 0 || bytes.length > REFERENCE_MAX_BYTES)
          throw new Error("size");
        const mime =
          sniffMime(bytes) ??
          response.headers.get("content-type")?.split(";")[0].trim() ??
          "";
        if (!REFERENCE_MIMES.includes(mime)) throw new Error("type");
        references[index] = { bytes, mime, url };
      } catch {
        failed.push(url);
      }
    }),
  );
  return { references: references.filter(Boolean), failed };
}

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

const openAiSize = (aspect: GeminiAspectRatio) =>
  aspect === "16:9" || aspect === "4:3"
    ? "1536x1024"
    : aspect === "9:16" || aspect === "4:5" || aspect === "3:4"
      ? "1024x1536"
      : "1024x1024";

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};

const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const clip = (value: string) => value.replace(/\s+/g, " ").slice(0, 220);

/** Names a user or model may use for an engine, mapped to the engine's id. */
export function normalizeEngine(value: unknown): ImageProvider | null {
  if (typeof value !== "string") return null;
  const name = value.toLowerCase().replace(/[\s_.-]+/g, "");
  if (!name) return null;
  if (/eleven|11labs|לאבז|לאבס|אילו/.test(name)) return "elevenlabs";
  if (/google|gemini|nano|banana|גוגל|ג'מיני|גמיני/.test(name)) return "google";
  if (/higgs|היג|היגס/.test(name)) return "higgsfield";
  if (/openai|gpt|אופןאיי|אופנאיי/.test(name)) return "openai";
  return null;
}

/** What a failed ElevenLabs call means for the user, in plain Hebrew. */
export function elevenLabsReason(status: number, body: string): string {
  const text = body.toLowerCase();
  if (status === 402 || text.includes("paid_plan_required"))
    return "ממשק התמונות של ElevenLabs דורש תוכנית Pro ומעלה בחשבון ElevenLabs (המפתח מחובר, אבל התוכנית לא מספיקה)";
  if (text.includes("invalid_api_key"))
    return "מפתח ה-ElevenLabs לא תקין. צריך להדביק אותו מחדש בהגדרות מודלי AI";
  if (status === 401 || status === 403 || text.includes("missing_permissions"))
    return "מפתח ה-ElevenLabs מחובר, אבל חסרה לו הרשאה Image & Video (או Flows). אפשר להוסיף אותה ב-elevenlabs.io/app/api/api-keys";
  if (status === 429)
    return "ElevenLabs מגביל קצב כרגע או שהקרדיטים נגמרו. אפשר לנסות שוב עוד רגע";
  return `${status} ${clip(body)}`;
}

const ELEVENLABS_FAILURES: Record<string, string> = {
  moderated: "ElevenLabs חסם את התוכן בסינון שלו. צריך לנסח את התיאור אחרת",
  charging_failed: "אין מספיק קרדיטים בחשבון ElevenLabs",
  timeout: "ElevenLabs לא סיים בזמן",
  invalid_parameters: "ElevenLabs דחה את הפרמטרים של הבקשה",
};

/** gpt-image-1 was shut down on 2026-10-23; Sunburst is the replacement OpenAI names for edits and generation. */
export const OPENAI_IMAGE_MODEL = "gpt-image-2.5-sunburst";

async function viaOpenAi(
  key: string,
  prompt: string,
  aspect: GeminiAspectRatio,
  fetchImpl: typeof fetch,
  references: ImageReference[],
): Promise<MadeImage> {
  let response: Response;
  if (references.length > 0) {
    const form = new FormData();
    form.append("model", OPENAI_IMAGE_MODEL);
    form.append("prompt", prompt);
    form.append("size", openAiSize(aspect));
    references.forEach((reference, index) =>
      form.append(
        "image[]",
        new Blob([reference.bytes as BlobPart], { type: reference.mime }),
        `reference-${index + 1}.${reference.mime.split("/")[1] === "jpeg" ? "jpg" : reference.mime.split("/")[1]}`,
      ),
    );
    response = await fetchImpl("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } else {
    response = await fetchImpl("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt,
        n: 1,
        size: openAiSize(aspect),
        output_format: "png",
      }),
    });
  }
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
  references: ImageReference[],
): Promise<MadeImage> {
  const made = await (deps.gemini ?? generateGeminiImage)({
    apiKey: key,
    prompt,
    images: references.map((reference) => reference.bytes),
    mimeTypes: references.map((reference) => reference.mime),
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
  references: ImageReference[],
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
      ...(references.length > 0
        ? {
            images: references.map((reference) => ({
              type: "inline_base64",
              content_base64: toBase64(reference.bytes),
              mime_type: reference.mime,
            })),
          }
        : {}),
    }),
  });
  const started = await submit.json().catch(() => ({}));
  if (!submit.ok || !started?.id)
    throw new Error(elevenLabsReason(submit.status, JSON.stringify(started)));
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
      throw new Error(elevenLabsReason(poll.status, JSON.stringify(state)));
    if (state.status === "failed")
      throw new Error(
        ELEVENLABS_FAILURES[String(state.failure_reason)] ??
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

const HIGGSFIELD_ASPECTS: Record<string, string> = {
  "1:1": "1:1",
  "16:9": "16:9",
  "9:16": "9:16",
  "4:3": "4:3",
  "3:4": "3:4",
  "4:5": "3:4",
};

/** Soul 2: text-to-image, or image-to-image when there is a public reference link. */
async function viaHiggsfield(
  key: string,
  prompt: string,
  aspect: GeminiAspectRatio,
  deps: ImageDeps,
  fetchImpl: typeof fetch,
  references: ImageReference[],
): Promise<MadeImage> {
  const base = "https://api.higgsfield.ai";
  const headers = {
    Authorization: `Key ${key}`,
    "Content-Type": "application/json",
  };
  const reference = [...references].reverse().find((entry) => entry.url);
  const submit = await fetchImpl(
    `${base}/higgsfield-ai/soul/v2/${reference ? "image-to-image" : "standard"}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt,
        aspect_ratio: HIGGSFIELD_ASPECTS[aspect] ?? "1:1",
        resolution: "720p",
        batch_size: 1,
        ...(reference ? { image_url: reference.url } : {}),
      }),
    },
  );
  const started = await submit.json().catch(() => ({}));
  if (!submit.ok || !started?.request_id)
    throw new Error(`${submit.status} ${clip(JSON.stringify(started))}`);
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const polls = deps.maxPolls ?? 40;
  for (let attempt = 0; attempt < polls; attempt++) {
    await sleep(deps.pollMs ?? 2000);
    const poll = await fetchImpl(
      `${base}/requests/${encodeURIComponent(started.request_id)}/status`,
      { headers },
    );
    const state = await poll.json().catch(() => ({}));
    if (!poll.ok)
      throw new Error(`${poll.status} ${clip(JSON.stringify(state))}`);
    if (["failed", "nsfw", "canceled"].includes(state.status))
      throw new Error(clip(String(state.error ?? state.status)));
    if (state.status === "completed") {
      const url = state.images?.[0]?.url;
      if (!url) throw new Error("לא הוחזר קישור לתמונה");
      const file = await fetchImpl(url);
      if (!file.ok) throw new Error(`הורדה ${file.status}`);
      return {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mime: file.headers.get("content-type")?.split(";")[0] || "image/png",
        provider: "higgsfield",
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
