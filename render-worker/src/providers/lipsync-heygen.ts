// HeyGen Avatar IV lip sync on OpenRouter (see lipsync.ts for the providers' shape).
import { openRouterProvider } from "./openrouter.ts";
import type { LipsyncProvider, MediaInput } from "./types.ts";
import { estimateFor } from "./lipsync.ts";
import type { ApiKeyOptions } from "./lipsync.ts";

export const HEYGEN_LIPSYNC_MODEL = "heygen/avatar-iv";

/**
 * HeyGen Avatar IV on OpenRouter: one portrait + the scene's own voice line -> a lip-synced
 * talking video whose length follows the audio, at $0.05 a second. OpenRouter's model page:
 * the spoken audio can be "a supplied audio track, which the image is lip-synced to directly";
 * the video API takes image and audio references in input_references (ContentPartAudio).
 * https://openrouter.ai/heygen/avatar-iv · https://openrouter.ai/api/v1/videos/models
 * Same key, job API and poll as the OpenRouter scene engine. Verify with one paid call.
 */
export function heygenLipsyncBody({
  imageUrl,
  audioUrl,
  line,
  motionPrompt,
  aspect,
}: MediaInput) {
  if (!imageUrl) throw new Error("heygen lipsync needs a public image url");
  if (!audioUrl) throw new Error("heygen lipsync needs the voice line");
  const motion = String(motionPrompt ?? "").trim();
  return {
    model: HEYGEN_LIPSYNC_MODEL,
    // The model can also voice a text script: the prompt is the line alone, so it can never
    // say other words than the voice file.
    prompt: line,
    resolution: "1080p",
    // Avatar IV renders 16:9, 9:16 and 1:1.
    aspect_ratio: ["16:9", "9:16", "1:1"].includes(aspect) ? aspect : "9:16",
    input_references: [
      { type: "image_url", image_url: { url: imageUrl } },
      { type: "audio_url", audio_url: { url: audioUrl } },
    ],
    // The skin's own movement while she speaks (Avatar IV's motion_prompt passthrough).
    ...(motion
      ? { provider: { options: { heygen: { motion_prompt: motion } } } }
      : {}),
  };
}

/** HeyGen Avatar IV lip sync, run through OpenRouter's video jobs on the tenant's key. */
export function heygenLipsyncProvider({
  apiKey,
  fetchImpl = fetch,
}: ApiKeyOptions = {}): LipsyncProvider {
  const jobs = openRouterProvider({ apiKey, fetchImpl });
  return {
    name: "heygen",
    model: HEYGEN_LIPSYNC_MODEL,
    needs: "image",
    needsPublicMedia: true,
    estimate: estimateFor("heygen", 0.05),
    submit: (input: MediaInput) => jobs.submitBody(heygenLipsyncBody(input)),
    poll: (jobId: string) => jobs.poll(jobId),
  };
}
