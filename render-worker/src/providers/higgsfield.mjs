// Higgsfield image-to-video (PixVerse V6). Auth is `Key id:secret`.
// The still must be a URL Higgsfield can fetch; the worker signs the private file.
import { higgsfieldCredential } from "./higgsfield-credential.mjs";
const BASE = () =>
  (process.env.HIGGSFIELD_API_BASE || "https://api.higgsfield.ai").replace(
    /\/$/,
    "",
  );
const MODEL = () => process.env.HIGGSFIELD_VIDEO_MODEL || "pixverse/v6";
const USD_PER_SECOND = () =>
  Number(process.env.HIGGSFIELD_USD_PER_SECOND) || 0.1;

export const higgsfieldClipSeconds = (seconds) =>
  Math.min(15, Math.max(1, Math.ceil(Number(seconds) || 5)));

export function higgsfieldClipBody({
  prompt,
  imageUrl,
  durationS,
  generateAudio,
}) {
  if (!imageUrl) throw new Error("higgsfield needs a public image_url");
  return {
    prompt,
    image_url: imageUrl,
    duration: higgsfieldClipSeconds(durationS),
    resolution: "720p",
    generate_audio: generateAudio === true,
    negative_prompt: "text, letters, captions, logo, watermark",
  };
}

export function higgsfieldProvider({
  keyId,
  keySecret,
  fetchImpl = fetch,
} = {}) {
  const credential = higgsfieldCredential(keyId, keySecret);
  const auth = () => {
    if (!credential.includes(":"))
      throw new Error("A Higgsfield key in id:secret form is required");
    return {
      Authorization: `Key ${credential}`,
      "Content-Type": "application/json",
    };
  };
  return {
    name: "higgsfield",
    model: MODEL(),
    needsPublicImage: true,
    estimate({ durationS }) {
      const seconds = higgsfieldClipSeconds(durationS);
      return { credits: 0, usd: +(seconds * USD_PER_SECOND()).toFixed(2) };
    },
    async submit(input) {
      const response = await fetchImpl(`${BASE()}/${MODEL()}/image-to-video`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify(higgsfieldClipBody(input)),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          `higgsfield submit ${response.status}: ${JSON.stringify(data).slice(0, 300)}`,
        );
      if (!data.request_id)
        throw new Error("higgsfield submit returned no request_id");
      return { jobId: data.request_id };
    },
    async poll(jobId) {
      const response = await fetchImpl(
        `${BASE()}/requests/${encodeURIComponent(jobId)}/status`,
        { headers: auth() },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          `higgsfield poll ${response.status}: ${data.message ?? response.status}`,
        );
      if (data.status === "completed") {
        const url = data.video?.url;
        return url
          ? { status: "succeeded", url }
          : { status: "failed", error: "higgsfield returned no video url" };
      }
      if (data.status === "failed" || data.status === "nsfw")
        return {
          status: "failed",
          error: data.error || data.message || "higgsfield task failed",
        };
      return { status: "pending" };
    },
  };
}
