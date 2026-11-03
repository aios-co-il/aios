import type { z } from "zod";
import type {
  creativeFormat,
  creativeVariation,
  creativeLayer,
  creativeComment,
  storyboardFrame,
} from "./creativeAssetPayload";
export type CreativeFormat = z.output<typeof creativeFormat>;

import type { BrandBook, StyleReference } from "./brandKit";
import type { CreativeVisualStyleId } from "./visualStyles";

export type CreativeProjectType = "static" | "video";

export type { CreativeVisualStyleId };

export interface StoryboardStyleLock {
  lock: string;
  referenceImageUrl?: string;
}

export type StoryboardFrame = z.output<typeof storyboardFrame>;

export type VideoSceneStatus = NonNullable<StoryboardFrame["status"]>;

export type CreativeComment = z.output<typeof creativeComment>;

export type LayerShadowStyle = NonNullable<CreativeLayer["shadowStyle"]>;

export type CreativeLayerRole = NonNullable<CreativeLayer["role"]>;

export type CreativeLayer = z.output<typeof creativeLayer>;

export type CreativeVariation = z.output<typeof creativeVariation>;

export interface CreativeItem {
  id: string;
  title: string | null;
  status: string;
  client_id: string | null;
  payload: Record<string, unknown> | null;
  current_stage_id: string | null;
  target_channel: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreativeAssetRow {
  id: string;
  type: string;
  url: string | null;
  content: string | null;
  meta: {
    source?: string;
    variation_id?: string;
    variation_name?: string;
    comments?: CreativeComment[];
    layers?: CreativeLayer[];
    format?: CreativeFormat;
  } | null;
  created_at: string;
  run_id: string | null;
}

export interface CreativeProjectDraft {
  title: string;
  briefText: string;
  copyText: string;
  instructions: string;
  format: CreativeFormat;
  projectType: CreativeProjectType;
  visualStyle: CreativeVisualStyleId;
  clientId?: string | null;
  clientWebsite?: string;
  logoUrl?: string;
  brandBook?: BrandBook;
  styleReferences: StyleReference[];
}
