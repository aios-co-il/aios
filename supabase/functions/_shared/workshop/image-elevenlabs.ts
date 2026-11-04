/**
 * One still from ElevenLabs flows (Gemini 3 Pro Image): submit, poll until done, download.
 */

import { type GeminiAspectRatio } from "../creative/geminiImage.ts";
import { toBase64 } from "./image-bytes.ts";
import { accepted, clip } from "./image-errors.ts";
import {
  type ImageDeps,
  type ImageReference,
  type MadeImage,
} from "./image-providers.ts";

export async function viaElevenLabs(
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
  try {
    return await awaitElevenLabs(started.id, base, headers, deps, fetchImpl);
  } catch (error) {
    // Only a job ElevenLabs reports as failed holds no picture; after any other stop (a failed
    // check, a lost download, running out of polls) it may still finish and charge.
    throw (error as { ended?: boolean }).ended ? error : accepted(error);
  }
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

/** ElevenLabs ended the job without a picture: another engine may make it. */
function endedJob(message: string) {
  const error = new Error(message);
  (error as Error & { ended?: boolean }).ended = true;
  return error;
}

async function awaitElevenLabs(
  id: string,
  base: string,
  headers: Record<string, string>,
  deps: ImageDeps,
  fetchImpl: typeof fetch,
): Promise<MadeImage> {
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const polls = deps.maxPolls ?? 40;
  for (let attempt = 0; attempt < polls; attempt++) {
    await sleep(deps.pollMs ?? 2000);
    const poll = await fetchImpl(`${base}/${encodeURIComponent(id)}`, {
      headers,
    });
    const state = await poll.json().catch(() => ({}));
    if (!poll.ok)
      throw new Error(elevenLabsReason(poll.status, JSON.stringify(state)));
    if (state.status === "failed")
      throw endedJob(
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
