import type { Json } from "../../_shared/database.types.ts";

export type GetFacebookCampaignDataArgs = { client_id?: string; days?: number };

export type ListFacebookCampaignsArgs = {
  client_id: string;
  name_search?: string;
};

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

export type AnalyzeFacebookCampaignArgs = {
  client_id: string;
  campaign_id: string;
};

export type ListFacebookAdsArgs = { client_id: string; campaign_id: string };

export type InspectFacebookAdArgs = { client_id: string; ad_id: string };

export type DuplicateFacebookAdVariantsArgs = {
  client_id: string;
  source_ad_id: string;
  count?: number;
  variants: Array<Json>;
  daily_budget?: number;
  budget_level?: "campaign" | "adset";
  status?: "PAUSED" | "ACTIVE";
};

export type FacebookCampaignMutationArgs = {
  client_id?: string;
  campaign_id?: string;
  status?: "ACTIVE" | "PAUSED";
  level?: "campaign" | "adset" | "ad";
  daily_budget?: number;
  lifetime_budget?: number;
  name_suffix?: string;
};
