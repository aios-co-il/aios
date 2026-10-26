// OpenRouter video API (async jobs): POST /api/v1/videos, poll /videos/{id},
// download /videos/{id}/content with the key. Image-to-video sends the still
// as the first frame, so the worker signs a URL OpenRouter can fetch.
const BASE = () =>
  (process.env.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1").replace(
    /\/$/,
    "",
  );
export const OPENROUTER_VIDEO_MODEL = "kwaivgi/kling-v3.0-std";
const MODEL = () =>
  process.env.OPENROUTER_VIDEO_MODEL || OPENROUTER_VIDEO_MODEL;
// kling-v3.0-std on OpenRouter: $0.084 per output second (720p, no audio).
const USD_PER_SECOND = () =>
  Number(process.env.OPENROUTER_VIDEO_USD_PER_SECOND) || 0.084;

/** Kling v3 on OpenRouter renders 3–15 s. */
export const openRouterClipSeconds = (seconds) =>
  Math.min(15, Math.max(3, Math.ceil(Number(seconds) || 5)));

export function openRouterClipBody({ prompt, imageUrl, durationS, model }) {
  if (!imageUrl) throw new Error("openrouter needs a public image_url");
  return {
    model,
    prompt,
    duration: openRouterClipSeconds(durationS),
    resolution: "720p",
    generate_audio: false,
    frame_images: [
      {
        type: "image_url",
        image_url: { url: imageUrl },
        frame_type: "first_frame",
      },
    ],
  };
}

export function openRouterProvider({ apiKey, model, fetchImpl = fetch } = {}) {
  const chosen = model || MODEL();
  const auth = () => {
    if (!apiKey)
      throw new Error(
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
    estimate({ durationS }) {
      const seconds = openRouterClipSeconds(durationS);
      return { credits: 0, usd: +(seconds * USD_PER_SECOND()).toFixed(2) };
    },
    async submit(input) {
      const response = await fetchImpl(`${BASE()}/videos`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify(openRouterClipBody({ ...input, model: chosen })),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          `openrouter submit ${response.status}: ${JSON.stringify(data.error ?? data).slice(0, 300)}`,
        );
      if (!data.id) throw new Error("openrouter submit returned no job id");
      return { jobId: data.id };
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
        return {
          status: "succeeded",
          bytes: new Uint8Array(await video.arrayBuffer()),
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
