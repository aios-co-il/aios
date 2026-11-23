import type { Json } from "../../_shared/database.types.ts";

export type ToggleFacebookCampaignArgs = {
  client_id: string;
  campaign_id: string;
  status: "ACTIVE" | "PAUSED";
  level?: "campaign" | "adset" | "ad";
};

export type UpdateFacebookBudgetArgs = {
  client_id: string;
  campaign_id: string;
  daily_budget?: number;
  lifetime_budget?: number;
};

export type DuplicateFacebookCampaignArgs = {
  client_id: string;
  campaign_id: string;
  name_suffix?: string;
};

export type DuplicateFacebookAdVariantsArgs = {
  client_id: string;
  source_ad_id: string;
  count?: number;
  variants: Array<Json>;
  daily_budget?: number;
  budget_level?: "campaign" | "adset";
  status?: "PAUSED" | "ACTIVE";
};
