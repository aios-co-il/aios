import {
  readCreativeVideoSettings,
  type CreativeVideoSettings,
} from "./creativeProjectSettings";

/** Image model for storyboard stills; persisted unknown engines keep their previous default. */
export type StillModel = NonNullable<CreativeVideoSettings["still_model"]>;

export const getStillModel = (payload: unknown): StillModel =>
  readCreativeVideoSettings(payload).still_model ?? "gpt-image-2.5-sunburst";

export const getCharacterRefUrl = (payload: unknown): string | undefined =>
  readCreativeVideoSettings(payload).character_ref_url || undefined;

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
