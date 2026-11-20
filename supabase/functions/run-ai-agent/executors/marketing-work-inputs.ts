import type { Json } from "../../_shared/database.types.ts";

export type ListMarketingWorkItemsArgs = {
  client_id?: string;
  department?: "copy" | "creative" | "seo";
  status?: string;
  limit?: number;
};

export type GetMarketingWorkItemArgs = { item_id: string };

export type CreateMarketingWorkItemArgs = {
  client_id: string;
  title: string;
  brief: string;
  department?: "copy" | "creative" | "seo";
  content_type?: string;
  channel?: string;
  instructions?: string;
};

export type HandoffMarketingWorkItemArgs = {
  item_id: string;
  to_stage_type:
    | "strategy"
    | "copy"
    | "creative"
    | "target_paid"
    | "target_seo"
    | "target_organic"
    | "measurement";
};

export type UpdateMarketingWorkItemArgs = {
  item_id: string;
  title?: string;
  status?: "draft" | "in_progress" | "review" | "approved" | "archived";
  payload_patch?: Json;
};

export type GenerateAdImageArgs = {
  prompt: string;
  aspect_ratio?: "1:1" | "16:9" | "9:16" | "4:5";
  reference_urls?: Array<string>;
  engine?: "google" | "elevenlabs" | "higgsfield" | "openai";
};
