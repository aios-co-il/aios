import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";

export type GoogleAdsCampaignSummaryRow = {
  name: string;
  campaign_id: string;
  goal: GoogleReportGoal;
  /** Paused, removed or its report switched off; shown only when it spent. */
  off: boolean;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversions_value: number;
};

export type GoogleAdsTotals = Omit<
  GoogleAdsCampaignSummaryRow,
  "name" | "campaign_id" | "goal" | "off"
>;

export type GoogleAdsCampaignSummary = {
  campaigns: GoogleAdsCampaignSummaryRow[];
  totals: GoogleAdsTotals;
  ecommerce: GoogleAdsTotals;
  leads: GoogleAdsTotals;
  /** Campaigns set to pay for exposure (AIO-496): spend, impressions and clicks only. */
  traffic: GoogleAdsTotals;
  hasEcommerce: boolean;
  hasLeads: boolean;
  hasTraffic: boolean;
};

/** Purchases, revenue and ROAS of the ecommerce campaigns, from WooCommerce when it overlays Google Ads. */
export type GoogleStoreTotals = {
  purchases: number;
  revenue: number;
  roas: number;
  wooDiffers: boolean;
};

export type GoogleAdsFormatters = {
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
  formatUnitCost: (value: number) => string;
};
