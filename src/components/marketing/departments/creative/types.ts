import type { z } from "zod";
import type {
  creativeVariation,
  creativeLayer,
  creativeComment,
  storyboardFrame,
  creativeFormat,
} from "./creativeAssetPayload";
// Retain the public domain name in existing diagnostic fingerprints (AIO-334).
export type CreativeFormat = Extract<z.output<typeof creativeFormat>, string>;

import type { BrandBook, StyleReference } from "./brandKit";
import type { CreativeVisualStyleId } from "./visualStyles";
import type { CopyPayload } from "../../copyPayload";

export type CreativeProjectType = "static" | "video";

export type { CreativeVisualStyleId };

export interface StoryboardStyleLock {
  lock: string;
  referenceImageUrl?: string;
}

export interface StoryboardFrame extends z.output<typeof storyboardFrame> {
  id: z.output<typeof storyboardFrame>["id"];
}

export type VideoSceneStatus = NonNullable<StoryboardFrame["status"]>;

export type CreativeComment = z.output<typeof creativeComment>;

export type LayerShadowStyle = NonNullable<CreativeLayer["shadowStyle"]>;

export type CreativeLayerRole = NonNullable<CreativeLayer["role"]>;

export type CreativeLayer = z.output<typeof creativeLayer>;

export type CreativeVariation = Omit<
  z.output<typeof creativeVariation>,
  "format" | "layers" | "comments"
> & {
  format: CreativeFormat;
  layers: Array<CreativeLayer>;
  comments: Array<CreativeComment>;
};

export type ManualCreativePayload = CopyPayload & {
  visual_style?: CreativeVisualStyleId;
};

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
