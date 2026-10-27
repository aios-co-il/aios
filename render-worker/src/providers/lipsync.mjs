// Lip-sync providers: make a scene's character mouth its own voice line. Used only when the
// scene engine did not already speak the line in the clip (see nativeSpeech on the video
// providers). Same shape as the video providers:
//   estimate({ durationS })  -> { credits, usd }
//   submit(input)            -> { jobId }
//   poll(jobId)              -> { status: "pending" | "succeeded" | "failed", url?, error? }
// input: { imageBytes, imageUrl, audioBytes, audioUrl, videoUrl, prompt, durationS, aspect }
// `needs` says which picture the provider animates: "image" (the still) or "video" (the clip).
//
// Request shapes come from the published docs cited on each provider. None has been
// exercised with a paid call yet: verify each with one paid call before relying on it.
import { elevenLabsBaseUrl, imageMime } from "./elevenlabs.mjs";
import { higgsfieldCredential } from "./higgsfield-credential.mjs";
import { higgsfieldBaseUrl } from "./higgsfield.mjs";
import { klingBaseUrl, klingToken } from "./kling.mjs";
import { openRouterProvider } from "./openrouter.mjs";

/** Planning price per second of talking video, until the first paid run gives the real one. */
const usdPerSecond = (name, fallback) =>
  Number(process.env[`${name.toUpperCase()}_LIPSYNC_USD_PER_SECOND`]) ||
  fallback;

const estimateFor =
  (name, fallback = 0.1) =>
  ({ durationS }) => ({
    credits: 0,
    usd: +(
      Math.max(1, Math.ceil(Number(durationS) || 5)) *
      usdPerSecond(name, fallback)
    ).toFixed(2),
  });

export const audioMime = (bytes) => {
  // RIFF....WAVE
  if (bytes?.[0] === 0x52 && bytes?.[1] === 0x49 && bytes?.[2] === 0x46)
    return "audio/wav";
  return "audio/mpeg";
};

const errorText = (data) => JSON.stringify(data).slice(0, 300);

/**
 * ElevenLabs Creatify Aurora: one still + one speech audio -> a talking video whose length
 * follows the audio. Same key and Flows video endpoint as the ElevenLabs scene engine.
 * https://elevenlabs.io/docs/api-reference/flows/video/create (model_id creatify-aurora:
 * `image` and `audio` required, `resolution` 480p|720p)
 * https://elevenlabs.io/docs/eleven-api/guides/cookbooks/image-and-video (API model table)
 */
export function elevenLabsLipsyncBody({ imageBytes, audioBytes }) {
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

export function elevenLabsLipsyncProvider({ apiKey, fetchImpl = fetch } = {}) {
  const auth = () => {
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required for lip sync");
    return { "xi-api-key": apiKey, "Content-Type": "application/json" };
  };
  return {
    name: "elevenlabs",
    model: process.env.ELEVENLABS_LIPSYNC_MODEL || "creatify-aurora",
    needs: "image",
    estimate: estimateFor("elevenlabs"),
    async submit(input) {
      const response = await fetchImpl(
        `${elevenLabsBaseUrl()}/v1/flows/video`,
        {
          method: "POST",
          headers: auth(),
          body: JSON.stringify(elevenLabsLipsyncBody(input)),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          `elevenlabs lipsync ${response.status}: ${errorText(data)}`,
        );
      if (!data.id) throw new Error("elevenlabs lipsync returned no id");
      return { jobId: data.id };
    },
    async poll(jobId) {
      const response = await fetchImpl(
        `${elevenLabsBaseUrl()}/v1/flows/video/${encodeURIComponent(jobId)}`,
        { headers: auth() },
      );
      const data = await response.json().catch(() => ({}));
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

/**
 * Kling lip-sync: re-times the mouth of an existing clip (2-10 s, 720p/1080p) to an audio file.
 * POST /v1/videos/lip-sync { input: { video_url, mode: "audio2video", audio_type: "url",
 * audio_url } }, then GET /v1/videos/lip-sync/{task_id}. Kling API reference, section
 * "Lip-Sync" (https://app.klingai.com/global/dev/document-api/apiReference/model/videoTolip;
 * mirrored at https://glama.ai/mcp/servers/@199-mcp/mcp-kling). Keys: KLING_ACCESS_KEY and
 * KLING_SECRET_KEY on the worker (Kling has no tenant key today).
 */
export function klingLipsyncBody({ videoUrl, audioUrl }) {
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

export function klingLipsyncProvider({ fetchImpl = fetch } = {}) {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  const auth = () => {
    if (!accessKey || !secretKey)
      throw new Error(
        "KLING_ACCESS_KEY and KLING_SECRET_KEY are required for Kling lip sync",
      );
    return {
      Authorization: `Bearer ${klingToken(accessKey, secretKey)}`,
      "Content-Type": "application/json",
    };
  };
  return {
    name: "kling",
    model: "kling-lip-sync",
    needs: "video",
    needsPublicMedia: true,
    estimate: estimateFor("kling"),
    async submit(input) {
      const response = await fetchImpl(`${klingBaseUrl()}/v1/videos/lip-sync`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify(klingLipsyncBody(input)),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.code)
        throw new Error(
          `kling lipsync ${response.status}: ${data.message ?? errorText(data)}`,
        );
      const jobId = data.data?.task_id;
      if (!jobId) throw new Error("kling lipsync returned no task_id");
      return { jobId };
    },
    async poll(jobId) {
      const response = await fetchImpl(
        `${klingBaseUrl()}/v1/videos/lip-sync/${encodeURIComponent(jobId)}`,
        { headers: auth() },
      );
      const data = await response.json().catch(() => ({}));
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

/**
 * HeyGen Avatar IV on OpenRouter: one portrait + the scene's own voice line -> a lip-synced
 * talking video whose length follows the audio, at $0.05 a second. OpenRouter's model page:
 * the spoken audio can be "a supplied audio track, which the image is lip-synced to directly";
 * the video API takes image and audio references in input_references (ContentPartAudio).
 * https://openrouter.ai/heygen/avatar-iv · https://openrouter.ai/api/v1/videos/models
 * Same key, job API and poll as the OpenRouter scene engine. Verify with one paid call.
 */
export const HEYGEN_LIPSYNC_MODEL = "heygen/avatar-iv";

export function heygenLipsyncBody({ imageUrl, audioUrl, prompt, aspect }) {
  if (!imageUrl) throw new Error("heygen lipsync needs a public image url");
  if (!audioUrl) throw new Error("heygen lipsync needs the voice line");
  return {
    model: HEYGEN_LIPSYNC_MODEL,
    prompt,
    resolution: "1080p",
    // Avatar IV renders 16:9, 9:16 and 1:1.
    aspect_ratio: ["16:9", "9:16", "1:1"].includes(aspect) ? aspect : "9:16",
    input_references: [
      { type: "image_url", image_url: { url: imageUrl } },
      { type: "audio_url", audio_url: { url: audioUrl } },
    ],
  };
}

export function heygenLipsyncProvider({ apiKey, fetchImpl = fetch } = {}) {
  const jobs = openRouterProvider({ apiKey, fetchImpl });
  return {
    name: "heygen",
    model: HEYGEN_LIPSYNC_MODEL,
    needs: "image",
    needsPublicMedia: true,
    estimate: estimateFor("heygen", 0.05),
    submit: (input) => jobs.submitBody(heygenLipsyncBody(input)),
    poll: (jobId) => jobs.poll(jobId),
  };
}

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
}) {
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
} = {}) {
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
    async submit(input) {
      const response = await fetchImpl(
        `${higgsfieldBaseUrl()}/${model}/reference-to-video`,
        {
          method: "POST",
          headers: auth(),
          body: JSON.stringify(higgsfieldLipsyncBody(input)),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          `higgsfield lipsync ${response.status}: ${errorText(data)}`,
        );
      if (!data.request_id)
        throw new Error("higgsfield lipsync returned no request_id");
      return { jobId: data.request_id };
    },
    async poll(jobId) {
      const response = await fetchImpl(
        `${higgsfieldBaseUrl()}/requests/${encodeURIComponent(jobId)}/status`,
        { headers: auth() },
      );
      const data = await response.json().catch(() => ({}));
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

/**
 * Lip-sync providers this tenant can run, best first: ElevenLabs (the tenant's own key, a
 * documented image+audio lip-sync model), Kling (worker keys, needs the clip), HeyGen Avatar
 * IV (the tenant's OpenRouter key, image+audio), Higgsfield.
 */
export function lipsyncCandidates(keys = {}, env = process.env) {
  const names = [];
  if (keys.elevenLabsKey) names.push("elevenlabs");
  if (env.KLING_ACCESS_KEY && env.KLING_SECRET_KEY) names.push("kling");
  if (keys.openRouterKey) names.push("heygen");
  if (higgsfieldCredential(keys.higgsfieldKeyId, keys.higgsfieldKeySecret))
    names.push("higgsfield");
  // Last: Veo speaks the line itself from the still, so the voice is Veo's, not the chosen one.
  if (keys.openRouterKey) names.push("openrouter");
  return names;
}

/**
 * OpenRouter talking clip as the lip-sync fallback: the still and the line go to the talking
 * model (Veo 3.1 with audio), which says the line with matching lips in one generation.
 */
export function openRouterLipsyncProvider({ apiKey, fetchImpl = fetch } = {}) {
  const base = openRouterProvider({ apiKey, fetchImpl });
  return {
    name: "openrouter",
    model: base.talkingModel,
    needs: "image",
    needsPublicMedia: true,
    estimate: ({ durationS }) => base.estimate({ durationS, talking: true }),
    submit: (input) =>
      base.submit({
        imageUrl: input.imageUrl,
        prompt: `${input.prompt} Spoken in Hebrew.`,
        durationS: input.durationS,
        aspect: input.aspect,
        talking: true,
      }),
    poll: (jobId) => base.poll(jobId),
  };
}
