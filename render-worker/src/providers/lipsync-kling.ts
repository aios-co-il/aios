// Kling lip-sync on an existing clip (see lipsync.ts for the providers' shape).
import { klingAuth, klingBaseUrl } from "./kling.ts";
import { providerJson } from "./json.ts";
import type { KlingKeyPair } from "./kling.ts";
import type { KlingTaskResponse } from "./responses.ts";
import type {
  FetchImpl,
  LipsyncProvider,
  MediaInput,
  PollResult,
  SubmitResult,
} from "./types.ts";
import { errorText, estimateFor } from "./lipsync.ts";

/**
 * Kling lip-sync: re-times the mouth of an existing clip (2-10 s, 720p/1080p) to an audio file.
 * POST /v1/videos/lip-sync { input: { video_url, mode: "audio2video", audio_type: "url",
 * audio_url } }, then GET /v1/videos/lip-sync/{task_id}. Kling API reference, section
 * "Lip-Sync" (https://app.klingai.com/global/dev/document-api/apiReference/model/videoTolip;
 * mirrored at https://glama.ai/mcp/servers/@199-mcp/mcp-kling). Keys: the tenant's own Kling pair
 * (kling_access_key / kling_secret_key), as the Kling scene engine signs (klingKeys).
 */
export function klingLipsyncBody({ videoUrl, audioUrl }: MediaInput) {
  if (!videoUrl) throw new Error("kling lipsync needs the scene clip");
  if (!audioUrl) throw new Error("kling lipsync needs the voice line");
  return {
    input: {
      video_url: videoUrl,
      mode: "audio2video",
      audio_type: "url",
      audio_url: audioUrl,
    },
  };
}

export function klingLipsyncProvider({
  accessKey,
  secretKey,
  fetchImpl = fetch,
}: KlingKeyPair & { fetchImpl?: FetchImpl } = {}): LipsyncProvider {
  const auth = klingAuth({ accessKey, secretKey });
  return {
    name: "kling",
    model: "kling-lip-sync",
    needs: "video",
    needsPublicMedia: true,
    estimate: estimateFor("kling"),
    async submit(input: MediaInput): Promise<SubmitResult> {
      const response = await fetchImpl(`${klingBaseUrl()}/v1/videos/lip-sync`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify(klingLipsyncBody(input)),
      });
      const data = await providerJson<KlingTaskResponse>(response);
      if (!response.ok || data.code)
        throw new Error(
          `kling lipsync ${response.status}: ${data.message ?? errorText(data)}`,
        );
      const jobId = data.data?.task_id;
      if (!jobId) throw new Error("kling lipsync returned no task_id");
      return { jobId };
    },
    async poll(jobId: string): Promise<PollResult> {
      const response = await fetchImpl(
        `${klingBaseUrl()}/v1/videos/lip-sync/${encodeURIComponent(jobId)}`,
        { headers: auth() },
      );
      const data = await providerJson<KlingTaskResponse>(response);
      if (!response.ok || data.code)
        throw new Error(
          `kling lipsync poll ${response.status}: ${data.message ?? ""}`,
        );
      const status = data.data?.task_status;
      if (status === "succeed") {
        const url = data.data?.task_result?.videos?.[0]?.url;
        return url
          ? { status: "succeeded", url }
          : { status: "failed", error: "kling returned no video url" };
      }
      if (status === "failed")
        return {
          status: "failed",
          error: data.data?.task_status_msg || "kling lipsync failed",
        };
      return { status: "pending" };
    },
  };
}
