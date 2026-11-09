import type { Json } from "../../_shared/database.types.ts";

export type FbCreateCampaignArgs = {
  client_id: string;
  name: string;
  objective?: string;
  daily_budget?: number;
  special_ad_categories?: Array<string>;
};

export type FbCreateAdsetArgs = {
  campaign_id: string;
  name: string;
  daily_budget?: number;
  billing_event?: string;
  optimization_goal?: string;
  targeting: Json;
  start_time?: string;
  end_time?: string;
};

export type FbCreateCreativeFromMediaArgs = {
  client_id: string;
  media_id: string;
  page_id: string;
  message: string;
  link?: string;
  name?: string;
  call_to_action_type?: string;
  lead_form_id?: string;
};

export type FbCreateAdArgs = {
  adset_id: string;
  name: string;
  creative_id: string;
};

export type FbReplaceLeadFormArgs = { ad_id: string; new_form_id: string };

export type FbUpdateBudgetArgs = {
  entity_id: string;
  daily_budget?: number;
  lifetime_budget?: number;
};

export type FbPauseArgs = { entity_id: string };

export type FbResumeArgs = { entity_id: string };

export type GadsPauseArgs = { customer_id: string; campaign_id: string };

export type GadsResumeArgs = { customer_id: string; campaign_id: string };

export type GadsUpdateBudgetArgs = {
  customer_id: string;
  campaign_id: string;
  daily_budget: number;
};

export type AdActionApprovalArgs = {
  client_id?: string;
  name?: string;
  objective?: string;
  daily_budget?: number;
  special_ad_categories?: Array<string>;
  campaign_id?: string;
  billing_event?: string;
  optimization_goal?: string;
  targeting?: Json;
  start_time?: string;
  end_time?: string;
  media_id?: string;
  page_id?: string;
  message?: string;
  link?: string;
  call_to_action_type?: string;
  lead_form_id?: string;
  adset_id?: string;
  creative_id?: string;
  ad_id?: string;
  new_form_id?: string;
  entity_id?: string;
  lifetime_budget?: number;
  customer_id?: string;
};
