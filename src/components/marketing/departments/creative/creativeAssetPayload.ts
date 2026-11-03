import { z } from "zod";
import type { CreativeFormat } from "./types";
import { CREATIVE_COMPOSITIONS, type CompositionId } from "./compositions";
import {
  CREATIVE_VISUAL_STYLES,
  type CreativeVisualStyleId,
} from "./visualStyles";
import { storedObject } from "./storedPayload";

export const creativeFormat = z.custom<CreativeFormat>(
  (value) =>
    value === "9:16" || value === "1:1" || value === "4:5" || value === "16:9",
);
export const visualStyle = z.custom<CreativeVisualStyleId>((value) =>
  CREATIVE_VISUAL_STYLES.some((style) => style.id === value),
);
const optionalText = z.string().optional();
const optionalNumber = z.number().finite().optional();
const optionalFlag = z.boolean().optional();

export const imageCost = storedObject({
  model: z.enum([
    "gpt-image-1",
    "gpt-image-2.5-sunburst",
    "gemini-3-pro-image",
  ]),
  quality: z.enum(["low", "medium", "high"]),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]),
  textTokens: z.number().finite(),
  imageInTokens: z.number().finite(),
  outputTokens: z.number().finite(),
  totalTokens: z.number().finite(),
  costUsd: z.number().finite(),
  source: z.enum(["api", "official_table", "inferred"]),
  createdAt: z.string(),
  referenceCount: optionalNumber,
});
export const creativeComment = storedObject({
  id: z.string(),
  text: z.string(),
  createdAt: z.string(),
});
export const creativeLayer = storedObject({
  id: z.string(),
  type: z.enum(["background", "text", "shape", "image"]),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
  rotation: optionalNumber,
  src: optionalText,
  role: z
    .enum([
      "logo",
      "hero",
      "type_field",
      "headline",
      "sub",
      "bullet",
      "icon",
      "icon_label",
      "footer",
      "cta",
      "cta_fill",
      "divider",
    ])
    .optional(),
  icon: optionalText,
  text: optionalText,
  fontFamily: optionalText,
  fontSize: optionalNumber,
  fontWeight: optionalText,
  color: optionalText,
  textAlign: z.enum(["right", "center", "left"]).optional(),
  fill: optionalText,
  opacity: optionalNumber,
  borderRadius: optionalNumber,
  textShadow: optionalText,
  boxShadow: optionalText,
  letterSpacing: optionalText,
  lineHeight: optionalNumber,
  shadowStyle: z.enum(["none", "soft", "extrude", "halo"]).optional(),
  shadowDepth: optionalNumber,
  shadowColor: optionalText,
  shadowBlur: optionalNumber,
  locked: optionalFlag,
});
export const creativeVariation = storedObject({
  id: z.string(),
  imageUrl: z.string(),
  name: z.string().default("גרסה"),
  format: creativeFormat.default("1:1"),
  layers: z.array(creativeLayer).default([]),
  comments: z.array(creativeComment).default([]),
  createdAt: z.string().default(""),
  source: z.enum(["ai", "manual_edit", "storyboard_import"]).optional(),
  visualStyle: visualStyle.optional(),
  copyKey: optionalText,
  copyLabel: optionalText,
  copyText: optionalText,
  conceptId: optionalText,
  conceptName: optionalText,
  rejected: optionalFlag,
  rejectNote: optionalText,
  parentId: optionalText,
  generationCost: imageCost.optional(),
  compositionId: z
    .custom<CompositionId>((value) =>
      CREATIVE_COMPOSITIONS.some((item) => item.id === value),
    )
    .optional(),
  styleSourceId: optionalText,
  liveTextLayers: optionalFlag,
});
export const storyboardFrame = storedObject({
  id: z.string(),
  order: z.number().finite(),
  title: z.string(),
  shot: z.string(),
  visualPrompt: z.string(),
  overlayText: z.string(),
  voiceover: z.string(),
  motionPrompt: optionalText,
  duration: z.number().finite(),
  imageUrl: optionalText,
  generationCost: imageCost.optional(),
  x: z.number().finite(),
  y: z.number().finite(),
  status: z
    .enum([
      "draft",
      "still_generating",
      "still_ready",
      "still_approved",
      "clip_generating",
      "clip_ready",
      "clip_approved",
      "failed",
    ])
    .optional(),
  locked: optionalFlag,
  hasCharacter: optionalFlag,
  stillAssetId: optionalText,
  clipAssetId: optionalText,
  clipPath: optionalText,
  clipStale: optionalFlag,
  voiceAssetId: optionalText,
  voiceText: optionalText,
});
