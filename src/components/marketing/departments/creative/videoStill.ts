/** Image model for storyboard stills. Nano Banana Pro keeps a recurring character steadier. */
export type StillModel = "gpt-image-1" | "nano-banana-pro";

export const getStillModel = (
  payload: Record<string, unknown> | null | undefined,
): StillModel => {
  const video = payload?.video;
  const model =
    video && typeof video === "object"
      ? (video as Record<string, unknown>).still_model
      : undefined;
  return model === "nano-banana-pro" ? "nano-banana-pro" : "gpt-image-1";
};

export const getCharacterRefUrl = (
  payload: Record<string, unknown> | null | undefined,
): string | undefined => {
  const video = payload?.video;
  const url =
    video && typeof video === "object"
      ? (video as Record<string, unknown>).character_ref_url
      : undefined;
  return typeof url === "string" && url ? url : undefined;
};

// Image models refuse or imitate protected studio looks; describe the look instead.
const STUDIO_NAMES =
  /\b(pixar|disney|dreamworks|illumination|ghibli)(?:\s*\/\s*(pixar|disney|dreamworks))?\b(?:[-\s]?(style|quality|like))?/gi;

/** Removes studio names from a video still prompt and states the no-text rule. */
export const sanitizeVideoStillPrompt = (prompt: string): string =>
  [
    prompt
      .replace(STUDIO_NAMES, "high-end 3D animated feature")
      .replace(
        /(high-end 3D animated feature[\s,/]*){2,}/gi,
        "high-end 3D animated feature ",
      )
      .trim(),
    "No text, no letters, no logos.",
  ].join("\n");
