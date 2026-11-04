/**
 * One still from OpenAI: generation from the prompt, or an edit of the reference pictures.
 */

import { type GeminiAspectRatio } from "../creative/geminiImage.ts";
import { fromBase64 } from "./image-bytes.ts";
import { clip } from "./image-errors.ts";
import { type ImageReference, type MadeImage } from "./image-providers.ts";

/** gpt-image-1 was shut down on 2026-10-23; Sunburst is the replacement OpenAI names for edits and generation. */
export const OPENAI_IMAGE_MODEL = "gpt-image-2.5-sunburst";

export async function viaOpenAi(
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

const openAiSize = (aspect: GeminiAspectRatio) =>
  aspect === "16:9" || aspect === "4:3"
    ? "1536x1024"
    : aspect === "9:16" || aspect === "4:5" || aspect === "3:4"
      ? "1024x1536"
      : "1024x1024";
