// OpenRouter video API (async jobs): POST /api/v1/videos, poll /videos/{id},
// download /videos/{id}/content with the key. Image-to-video sends the still
// as the first frame, so the worker signs a URL OpenRouter can fetch.
// A talking scene goes to OPENROUTER_TALKING_MODEL (Veo 3.1) with audio on and
// the Hebrew line in the prompt, so the clip speaks it with matching lips.
// Request shape is from the docs; verify the talking slug, generate_audio and
// Hebrew speech with one paid call before relying on it.
const BASE = () =>
  (process.env.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1").replace(
    /\/$/,
    "",
  );
export const OPENROUTER_VIDEO_MODEL = "kwaivgi/kling-v3.0-std";
export const OPENROUTER_TALKING_MODEL = "google/veo-3.1";
const MODEL = () =>
  process.env.OPENROUTER_VIDEO_MODEL || OPENROUTER_VIDEO_MODEL;
const TALKING_MODEL = () =>
  process.env.OPENROUTER_TALKING_MODEL || OPENROUTER_TALKING_MODEL;
// kling-v3.0-std on OpenRouter: $0.084 per output second (720p, no audio).
const USD_PER_SECOND = () =>
  Number(process.env.OPENROUTER_VIDEO_USD_PER_SECOND) || 0.084;
// Veo 3.1 with audio: planning estimate until the first paid talking clip.
const TALKING_USD_PER_SECOND = () =>
  Number(process.env.OPENROUTER_TALKING_USD_PER_SECOND) || 0.4;

const family = (model) => {
  const name = String(model ?? "").toLowerCase();
  if (name.includes("veo")) return "veo";
  if (name.includes("seedance")) return "seedance";
  return "kling";
};

const between = (value, min, max) =>
  Math.min(max, Math.max(min, Math.ceil(Number(value) || 5)));

/** Lengths each model renders: Kling v3 3–15 s, Seedance 2.5 4–30 s, Veo 3.1 4, 6 or 8 s. */
export const openRouterClipSeconds = (seconds, model = MODEL()) => {
  const kind = family(model);
  if (kind === "veo") {
    const value = Number(seconds) || 5;
    return value <= 4 ? 4 : value <= 6 ? 6 : 8;
  }
  if (kind === "seedance") return between(seconds, 4, 30);
  return between(seconds, 3, 15);
};

/** Veo takes 16:9 and 9:16 only; Kling and Seedance also take 1:1. */
export const openRouterAspect = (aspect, model = MODEL()) => {
  if (aspect === "16:9") return "16:9";
  if (aspect === "1:1" && family(model) !== "veo") return "1:1";
  return "9:16";
};

export function openRouterClipBody({
  prompt,
  imageUrl,
  durationS,
  aspect,
  model,
  generateAudio = false,
}) {
  if (!imageUrl) throw new Error("openrouter needs a public image_url");
  return {
    model,
    prompt,
    duration: openRouterClipSeconds(durationS, model),
    resolution: "720p",
    aspect_ratio: openRouterAspect(aspect, model),
    generate_audio: generateAudio === true,
    frame_images: [
      {
        type: "image_url",
        image_url: { url: imageUrl },
        frame_type: "first_frame",
      },
    ],
  };
}

/** Raised before OpenRouter accepted a job: nothing was charged, so the clip may fall back. */
const beforeSubmit = (message, status) =>
  Object.assign(new Error(message), { submitted: false, status });

export function openRouterProvider({ apiKey, model, fetchImpl = fetch } = {}) {
  const chosen = model || MODEL();
  const auth = () => {
    if (!apiKey)
      throw beforeSubmit(
        "OpenRouter needs a connected OpenRouter brain with a key (brains, connections and AI keys)",
      );
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  };
  return {
    name: "openrouter",
    model: chosen,
    needsPublicImage: true,
    // A talking scene is made in one pass on the talking model (jobs/clip.mjs).
    nativeSpeech: true,
    talkingModel: TALKING_MODEL(),
    estimate({ durationS, talking = false }) {
      if (talking) {
        const seconds = openRouterClipSeconds(durationS, TALKING_MODEL());
        return {
          credits: 0,
          usd: +(seconds * TALKING_USD_PER_SECOND()).toFixed(2),
        };
      }
      // A Kling clip is billed for 5 s at least (a 3 s clip cost $0.42 on OpenRouter).
      const seconds = openRouterClipSeconds(durationS, chosen);
      const billed =
        family(chosen) === "kling" ? Math.max(5, seconds) : seconds;
      return { credits: 0, usd: +(billed * USD_PER_SECOND()).toFixed(2) };
    },
    async submit(input) {
      const talking = input.talking === true;
      const submitModel = talking ? TALKING_MODEL() : chosen;
      const response = await fetchImpl(`${BASE()}/videos`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify(
          openRouterClipBody({
            ...input,
            model: submitModel,
            generateAudio: talking,
          }),
        ),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw beforeSubmit(
          `openrouter submit ${response.status}: ${JSON.stringify(data.error ?? data).slice(0, 300)}`,
          response.status,
        );
      if (!data.id) throw beforeSubmit("openrouter submit returned no job id");
      return talking
        ? { jobId: data.id, model: submitModel }
        : { jobId: data.id };
    },
    async poll(jobId) {
      const id = encodeURIComponent(jobId);
      const response = await fetchImpl(`${BASE()}/videos/${id}`, {
        headers: auth(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          `openrouter poll ${response.status}: ${JSON.stringify(data.error ?? data).slice(0, 200)}`,
        );
      if (data.status === "completed") {
        // The content URL needs the key, so the worker gets bytes, not a URL.
        const video = await fetchImpl(
          `${BASE()}/videos/${id}/content?index=0`,
          {
            headers: auth(),
          },
        );
        if (!video.ok)
          throw new Error(
            `openrouter download ${video.status} (job ${jobId} kept for retry)`,
          );
        const cost = Number(data.usage?.cost);
        return {
          status: "succeeded",
          bytes: new Uint8Array(await video.arrayBuffer()),
          // What OpenRouter actually charged; the run records it instead of the estimate.
          ...(Number.isFinite(cost) && cost >= 0 ? { costUsd: cost } : {}),
        };
      }
      if (["failed", "cancelled", "canceled", "expired"].includes(data.status))
        return {
          status: "failed",
          error:
            (typeof data.error === "string"
              ? data.error
              : data.error?.message) || `openrouter job ${data.status}`,
        };
      return { status: "pending" };
    },
  };
}
