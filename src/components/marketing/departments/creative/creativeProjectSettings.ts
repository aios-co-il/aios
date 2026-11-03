import { z } from "zod";
import {
  isSceneEngine,
  isSoundEngine,
  type SceneEngine,
  type SoundEngine,
} from "./videoEngines";
import { storedObject } from "./storedPayload";
const optionalText = z.string().nullish();
const storedText = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.string().optional(),
);
export const creativeBrandBook = storedObject({
  name: storedText,
  colors: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
  fonts: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? undefined),
  voice: storedText,
  notes: z
    .string()
    .nullish()
    .transform((value) => value ?? ""),
  source: z.preprocess(
    (value) => (value === "upload" || value === "auto" ? value : "manual"),
    z.enum(["upload", "auto", "manual"]),
  ),
  fileUrl: storedText,
  fileName: storedText,
});
export const creativeStyleReference = storedObject({
  url: z.string(),
  name: storedText,
});
export const creativeVideoProduction = storedObject({
  status: z.enum(["running", "done", "failed"]),
  started_at: storedText,
  finished_at: optionalText,
  render_run_id: optionalText,
  error: optionalText,
});
export const creativeVideoSettings = storedObject({
  still_model: z
    .preprocess(
      (value) =>
        value === "nano-banana-pro" ? value : "gpt-image-2.5-sunburst",
      z.enum(["gpt-image-2.5-sunburst", "nano-banana-pro"]),
    )
    .optional(),
  scene_engine: z
    .preprocess(
      (value) => (isSceneEngine(value) ? value : "mock"),
      z.custom<SceneEngine>(isSceneEngine),
    )
    .optional(),
  sound_engine: z
    .preprocess(
      (value) => (isSoundEngine(value) ? value : "elevenlabs"),
      z.custom<SoundEngine>(isSoundEngine),
    )
    .optional(),
  voice_id: optionalText,
  character_ref_url: optionalText,
});
export const projectSettingsFields = {
  brand_book: creativeBrandBook.nullish(),
  style_references: z.array(creativeStyleReference).nullish(),
  video: storedObject({
    ...creativeVideoSettings.innerType().shape,
    production: creativeVideoProduction.nullish(),
  }).nullish(),
};
export type CreativeVideoSettings = z.output<typeof creativeVideoSettings>;

/** Read only the named editable video fields; unknown engines retain the free-preview default. */
export function readCreativeVideoSettings(
  payload: unknown,
): CreativeVideoSettings {
  const parsed = creativeVideoSettings.safeParse(videoObject(payload));
  if (parsed.success) {
    return parsed.data;
  }
  console.error("Invalid creative video settings", {
    fields: parsed.error.issues.map((issue) => issue.path.join(".")),
  });
  return {};
}

/** Validate production fields instead of trusting a status-only cast. */
export function readCreativeVideoProduction(payload: unknown) {
  const raw = videoObject(payload);
  const parsed = creativeVideoProduction.nullish().safeParse(raw.production);
  if (parsed.success) {
    return parsed.data ?? null;
  }
  console.error("Invalid creative video production", {
    fields: parsed.error.issues.map((issue) => issue.path.join(".")),
  });
  return null;
}

/** Decode the stored container without exposing its arbitrary keys to application models. */
function videoObject(payload: unknown) {
  const root = z.record(z.unknown()).safeParse(payload);
  const parsed = z
    .record(z.unknown())
    .safeParse(root.success ? root.data.video : undefined);
  return parsed.success ? parsed.data : {};
}
