// Video provider adapter. Every provider has the same shape, so a provider can be swapped
// without touching the job, the UI or Carmen:
//   estimate(input)        -> { credits, usd }
//   submit(input)          -> { jobId }
//   poll(jobId)            -> { status: "pending" | "succeeded" | "failed", url?, bytes?, error? }
// input: { imageBytes, imageUrl, prompt, negativePrompt, durationS, aspect }
import { klingProvider } from "./kling.mjs";
import { mockProvider } from "./mock.mjs";

const PROVIDERS = { kling: klingProvider, mock: mockProvider };

export function getVideoProvider(name = process.env.VIDEO_PROVIDER || "mock") {
  const factory = PROVIDERS[name];
  if (!factory)
    throw new Error(
      `Unknown VIDEO_PROVIDER "${name}" (expected ${Object.keys(PROVIDERS).join(", ")})`,
    );
  return factory();
}

/** Every clip prompt ends with the no-text rule; image models garble Hebrew. */
export const clipPrompt = (motionPrompt) =>
  [
    String(motionPrompt ?? "").trim() ||
      "Subtle natural motion, gentle camera push-in.",
    "No text, no letters, no logos.",
  ].join(" ");
