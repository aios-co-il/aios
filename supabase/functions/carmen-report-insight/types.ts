// The request the dashboard sends: the figures already on the user's screen.
// The frontend imports these types; request.ts validates the same shape.

/** A campaign goal of a report. */
export type InsightGoal = "ecommerce" | "leads" | "traffic";

/** The totals of one scope or campaign, in the dashboard's currency. */
export type InsightFigures = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  /** Analytics sessions; null without Analytics. */
  sessions: number | null;
};

/** One campaign of a goal, largest spend first. */
export type InsightCampaign = {
  name: string;
  channel: "facebook" | "google_ads";
  /** On or off as the platform last reported it; null when unknown. */
  on: boolean | null;
  figures: InsightFigures;
};

/** One part of the report: every campaign, or one goal's campaigns. */
export type InsightScope = {
  scope: "all" | InsightGoal;
  figures: InsightFigures;
  /** The period of equal length before; null when not loaded. */
  previous: InsightFigures | null;
  campaigns: Array<InsightCampaign>;
};

export type ReportInsightRequest = {
  currency: string;
  scopes: Array<InsightScope>;
};

export type ReportInsightResponse = { insight: string };
