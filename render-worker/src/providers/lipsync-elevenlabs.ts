// ElevenLabs Creatify Aurora lip sync (see lipsync.ts for the providers' shape).
import { elevenLabsBaseUrl, imageMime } from "./elevenlabs.ts";
import { providerJson } from "./json.ts";
import type { ElevenLabsFlowResponse } from "./responses.ts";
import type {
  LipsyncProvider,
  MediaInput,
  PollResult,
  SubmitResult,
} from "./types.ts";
import { audioMime, errorText, estimateFor } from "./lipsync.ts";
import type { ApiKeyOptions } from "./lipsync.ts";

/**
 * ElevenLabs Creatify Aurora: one still + one speech audio -> a talking video whose length
 * follows the audio. Same key and Flows video endpoint as the ElevenLabs scene engine.
 * https://elevenlabs.io/docs/api-reference/flows/video/create (model_id creatify-aurora:
 * `image` and `audio` required, `resolution` 480p|720p)
 * https://elevenlabs.io/docs/eleven-api/guides/cookbooks/image-and-video (API model table)
 */
export function elevenLabsLipsyncBody({ imageBytes, audioBytes }: MediaInput) {
  if (!imageBytes?.length)
    throw new Error("elevenlabs lipsync needs the still");
  if (!audioBytes?.length)
    throw new Error("elevenlabs lipsync needs the voice line");
  return {
    model_id: process.env.ELEVENLABS_LIPSYNC_MODEL || "creatify-aurora",
    image: {
      type: "inline_base64",
      content_base64: Buffer.from(imageBytes).toString("base64"),
      mime_type: imageMime(imageBytes),
    },
    audio: {
      type: "inline_base64",
      content_base64: Buffer.from(audioBytes).toString("base64"),
      mime_type: audioMime(audioBytes),
    },
    resolution: "720p",
  };
}

/** Creatify Aurora lip sync on the tenant's ElevenLabs key: the still and the voice line. */
export function elevenLabsLipsyncProvider({
  apiKey,
  fetchImpl = fetch,
}: ApiKeyOptions = {}): LipsyncProvider {
  const auth = () => {
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required for lip sync");
    return { "xi-api-key": apiKey, "Content-Type": "application/json" };
  };
  return {
    name: "elevenlabs",
    model: process.env.ELEVENLABS_LIPSYNC_MODEL || "creatify-aurora",
    needs: "image",
    estimate: estimateFor("elevenlabs"),
    async submit(input: MediaInput): Promise<SubmitResult> {
      const response = await fetchImpl(
        `${elevenLabsBaseUrl()}/v1/flows/video`,
        {
          method: "POST",
          headers: auth(),
          body: JSON.stringify(elevenLabsLipsyncBody(input)),
        },
      );
      const data = await providerJson<ElevenLabsFlowResponse>(response);
      if (!response.ok)
        throw new Error(
          `elevenlabs lipsync ${response.status}: ${errorText(data)}`,
        );
      if (!data.id) throw new Error("elevenlabs lipsync returned no id");
      return { jobId: data.id };
    },
    async poll(jobId: string): Promise<PollResult> {
      const response = await fetchImpl(
        `${elevenLabsBaseUrl()}/v1/flows/video/${encodeURIComponent(jobId)}`,
        { headers: auth() },
      );
      const data = await providerJson<ElevenLabsFlowResponse>(response);
      if (!response.ok)
        throw new Error(
          `elevenlabs lipsync poll ${response.status}: ${errorText(data)}`,
        );
      if (data.status === "completed")
        return data.content_url
          ? { status: "succeeded", url: data.content_url }
          : { status: "failed", error: "elevenlabs returned no video url" };
      if (data.status === "failed")
        return {
          status: "failed",
          error:
            data.error_message ||
            data.failure_reason ||
            "elevenlabs lipsync failed",
        };
      return { status: "pending" };
    },
  };
}
