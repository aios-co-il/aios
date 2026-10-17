// ElevenLabs Image & Video API. Veo 3.1 Fast is callable without the extra
// ByteDance approval. The first frame is the approved still.
const BASE = () =>
  (process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io").replace(
    /\/$/,
    "",
  );
const MODEL = () =>
  process.env.ELEVENLABS_VIDEO_MODEL || "veo-3.1-fast-generate-001";
const USD_PER_SECOND = () =>
  Number(process.env.ELEVENLABS_VIDEO_USD_PER_SECOND) || 0.15;

export const elevenLabsClipSeconds = (seconds) => {
  const value = Number(seconds) || 5;
  if (value <= 4) return 4;
  if (value <= 6) return 6;
  return 8;
};

export const elevenLabsAspect = (aspect) =>
  aspect === "16:9" ? "16:9" : "9:16";

const imageMime = (bytes) => {
  if (bytes?.[0] === 0xff && bytes?.[1] === 0xd8) return "image/jpeg";
  if (bytes?.[0] === 0x89 && bytes?.[1] === 0x50) return "image/png";
  return "image/webp";
};

export function elevenLabsVideoBody({
  prompt,
  imageBytes,
  durationS,
  aspect,
  generateAudio,
  model = MODEL(),
}) {
  const body = {
    model_id: model,
    prompt,
    aspect_ratio: elevenLabsAspect(aspect),
    duration_secs: elevenLabsClipSeconds(durationS),
    generate_audio: generateAudio === true,
    resolution: "720p",
  };
  if (imageBytes) {
    body.start_frame = {
      type: "inline_base64",
      content_base64: Buffer.from(imageBytes).toString("base64"),
      mime_type: imageMime(imageBytes),
    };
  }
  return body;
}

export function elevenLabsProvider({ apiKey, fetchImpl = fetch } = {}) {
  const auth = () => {
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required");
    return { "xi-api-key": apiKey, "Content-Type": "application/json" };
  };
  return {
    name: "elevenlabs",
    model: MODEL(),
    estimate({ durationS }) {
      const seconds = elevenLabsClipSeconds(durationS);
      return { credits: 0, usd: +(seconds * USD_PER_SECOND()).toFixed(2) };
    },
    async submit(input) {
      const response = await fetchImpl(`${BASE()}/v1/flows/video`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify(elevenLabsVideoBody({ ...input, model: MODEL() })),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          `elevenlabs submit ${response.status}: ${JSON.stringify(data).slice(0, 300)}`,
        );
      if (!data.id) throw new Error("elevenlabs submit returned no id");
      return { jobId: data.id };
    },
    async poll(jobId) {
      const response = await fetchImpl(
        `${BASE()}/v1/flows/video/${encodeURIComponent(jobId)}`,
        { headers: auth() },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          `elevenlabs poll ${response.status}: ${JSON.stringify(data).slice(0, 300)}`,
        );
      if (data.status === "completed") {
        return data.content_url
          ? { status: "succeeded", url: data.content_url }
          : { status: "failed", error: "elevenlabs returned no video url" };
      }
      if (data.status === "failed")
        return {
          status: "failed",
          error:
            data.error_message || data.failure_reason || "elevenlabs failed",
        };
      return { status: "pending" };
    },
  };
}
