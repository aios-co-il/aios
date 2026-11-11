import type { ReportCampaignGoal } from "@/lib/campaignGoals";
import type { ReportMetricKey } from "../metrics/reportMetricTypes";
import type { ReportWidget } from "./reportLayout";

/** Each goal block's headline metrics. */
export const GOAL_KPI_METRICS: Record<
  ReportCampaignGoal,
  Array<ReportMetricKey>
> = {
  ecommerce: [
    "spend",
    "revenue",
    "roas",
    "purchases",
    "costPerPurchase",
    "addToCart",
    "gaRevenue",
    "adsRevenue",
  ],
  leads: ["spend", "leads", "cpl"],
  traffic: ["spend", "clicks", "cpc", "ctr", "sessions"],
};

/** The delivery row every report opens with. */
export const DELIVERY_KPI_METRICS: Array<ReportMetricKey> = [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpm",
];

/** Each goal's campaign table columns. */
export const GOAL_CAMPAIGN_COLUMNS: Record<
  ReportCampaignGoal,
  Array<ReportMetricKey>
> = {
  ecommerce: [
    "spend",
    "addToCart",
    "purchases",
    "costPerPurchase",
    "revenue",
    "roas",
  ],
  leads: ["spend", "leads", "cpl"],
  traffic: ["spend", "clicks", "cpc", "ctr"],
};

// Purchases without a value (a free course) have no revenue to chart: their
// count and cost are charted instead.
export const GOAL_CHANNELS: Record<
  ReportCampaignGoal,
  Omit<Extract<ReportWidget, { kind: "channels" }>, "id" | "kind">
> = {
  ecommerce: {
    metric: "revenue",
    detail: "roas",
    fallback: { metric: "purchases", detail: "costPerPurchase" },
  },
  leads: { metric: "leads", detail: "cpl" },
  traffic: { metric: "clicks", detail: "cpc" },
};

export const GOAL_TRENDS: Record<
  ReportCampaignGoal,
  Omit<Extract<ReportWidget, { kind: "trend" }>, "id" | "kind">
> = {
  ecommerce: {
    metric: "revenue",
    compare: "spend",
    fallback: { metric: "purchases" },
  },
  leads: { metric: "leads" },
  traffic: { metric: "clicks" },
};
