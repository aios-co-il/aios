// Higgsfield Seedance 2.5 reference-to-video lip sync (see lipsync.ts for the providers' shape).
import { higgsfieldCredential } from "./higgsfield-credential.ts";
import { higgsfieldBaseUrl } from "./higgsfield.ts";
import { providerJson } from "./json.ts";
import type { HiggsfieldKeys } from "./higgsfield.ts";
import type { HiggsfieldRequestResponse } from "./responses.ts";
import type {
  FetchImpl,
  LipsyncProvider,
  MediaInput,
  PollResult,
  SubmitResult,
} from "./types.ts";
import { errorText, estimateFor } from "./lipsync.ts";

/**
 * Higgsfield Seedance 2.5 reference-to-video: the still as the subject and the voice line as a
 * reference audio. Documented inputs: image_urls, audio_urls, prompt, duration (4-30),
 * aspect_ratio, resolution, generate_audio.
 * https://docs.higgsfield.ai/docs/models/seedance-2-5/reference-to-video
 * The docs do not promise that a reference audio is lip-synced word for word: verify with one
 * paid call before choosing this over ElevenLabs or Kling.
 */
export function higgsfieldLipsyncBody({
  imageUrl,
  audioUrl,
  prompt,
  durationS,
  aspect,
}: MediaInput) {
  if (!imageUrl) throw new Error("higgsfield lipsync needs a public image url");
  if (!audioUrl) throw new Error("higgsfield lipsync needs a public audio url");
  return {
    prompt,
    image_urls: [imageUrl],
    audio_urls: [audioUrl],
    duration: Math.min(30, Math.max(4, Math.ceil(Number(durationS) || 5))),
    aspect_ratio: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"].includes(aspect)
      ? aspect
      : "9:16",
    resolution: "720p",
    generate_audio: true,
  };
}

export function higgsfieldLipsyncProvider({
  keyId,
  keySecret,
  fetchImpl = fetch,
}: HiggsfieldKeys & { fetchImpl?: FetchImpl } = {}): LipsyncProvider {
  const credential = higgsfieldCredential(keyId, keySecret);
  const model =
    process.env.HIGGSFIELD_LIPSYNC_MODEL || "bytedance/seedance-2.5";
  const auth = () => {
    if (!credential.includes(":"))
      throw new Error(
        "A Higgsfield key in id:secret form is required for lip sync",
      );
    return {
      Authorization: `Key ${credential}`,
      "Content-Type": "application/json",
    };
  };
  return {
    name: "higgsfield",
    model,
    needs: "image",
    needsPublicMedia: true,
    estimate: estimateFor("higgsfield"),
    async submit(input: MediaInput): Promise<SubmitResult> {
      const response = await fetchImpl(
        `${higgsfieldBaseUrl()}/${model}/reference-to-video`,
        {
          method: "POST",
          headers: auth(),
          body: JSON.stringify(higgsfieldLipsyncBody(input)),
        },
      );
      const data = await providerJson<HiggsfieldRequestResponse>(response);
      if (!response.ok)
        throw new Error(
          `higgsfield lipsync ${response.status}: ${errorText(data)}`,
        );
      if (!data.request_id)
        throw new Error("higgsfield lipsync returned no request_id");
      return { jobId: data.request_id };
    },
    async poll(jobId: string): Promise<PollResult> {
      const response = await fetchImpl(
        `${higgsfieldBaseUrl()}/requests/${encodeURIComponent(jobId)}/status`,
        { headers: auth() },
      );
      const data = await providerJson<HiggsfieldRequestResponse>(response);
      if (!response.ok)
        throw new Error(
          `higgsfield lipsync poll ${response.status}: ${data.message ?? response.status}`,
        );
      if (data.status === "completed")
        return data.video?.url
          ? { status: "succeeded", url: data.video.url }
          : { status: "failed", error: "higgsfield returned no video url" };
      if (data.status === "failed" || data.status === "nsfw")
        return {
          status: "failed",
          error: data.error || data.message || "higgsfield lipsync failed",
        };
      return { status: "pending" };
    },
  };
}
