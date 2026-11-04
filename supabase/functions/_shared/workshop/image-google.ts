/**
 * One still from Google Gemini, with the reference pictures inline.
 */

import {
  generateGeminiImage,
  type GeminiAspectRatio,
} from "../creative/geminiImage.ts";
import {
  type ImageDeps,
  type ImageReference,
  type MadeImage,
} from "./image-providers.ts";

export async function viaGoogle(
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
