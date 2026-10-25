// Video provider adapter. Every provider has the same shape, so a provider can be swapped
// without touching the job, the UI or Carmen:
//   estimate(input)        -> { credits, usd }
//   submit(input)          -> { jobId }
//   poll(jobId)            -> { status: "pending" | "succeeded" | "failed", url?, bytes?, error? }
// input: { imageBytes, imageUrl, prompt, negativePrompt, durationS, aspect }
import { elevenLabsProvider } from "./elevenlabs.mjs";
import { higgsfieldProvider } from "./higgsfield.mjs";
import { klingProvider } from "./kling.mjs";
import { mockProvider } from "./mock.mjs";

const PROVIDERS = {
  kling: (keys) =>
    klingProvider({
      accessKey: keys?.klingAccessKey,
      secretKey: keys?.klingSecretKey,
    }),
  mock: () => mockProvider(),
  elevenlabs: (keys) => elevenLabsProvider({ apiKey: keys?.elevenLabsKey }),
  higgsfield: (keys) =>
    higgsfieldProvider({
      keyId: keys?.higgsfieldKeyId,
      keySecret: keys?.higgsfieldKeySecret,
    }),
};

export function getVideoProvider(
  name = process.env.VIDEO_PROVIDER || "mock",
  keys = {},
) {
  const factory = PROVIDERS[name];
  if (!factory)
    throw new Error(
      `Unknown VIDEO_PROVIDER "${name}" (expected ${Object.keys(PROVIDERS).join(", ")})`,
    );
  return factory(keys);
}

/** Every clip prompt ends with the no-text rule; image models garble Hebrew. */
export const clipPrompt = (motionPrompt) =>
  [
    String(motionPrompt ?? "").trim() ||
      "Subtle natural motion, gentle camera push-in.",
    "No text, no letters, no logos.",
  ].join(" ");
