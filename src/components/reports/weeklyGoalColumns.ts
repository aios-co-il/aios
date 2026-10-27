import type { ReportCampaignGoal } from "@/lib/campaignGoals";
import { formatReportNumber } from "@/lib/reportNumber";
import type { WeeklyGoalTotals } from "@/lib/weeklyCampaignGoals";

/** One metric column of a weekly goal table. */
export type WeeklyGoalColumn = {
  label: string;
  value: (metrics: WeeklyGoalTotals, currency: string) => string;
  className?: string;
};

const impressions: WeeklyGoalColumn = {
  label: "חשיפות",
  value: (m) => formatReportNumber(m.impressions),
};
const clicks: WeeklyGoalColumn = {
  label: "קליקים",
  value: (m) => formatReportNumber(m.clicks),
};
const spend: WeeklyGoalColumn = {
  label: "הוצאה",
  value: (m, currency) => `${currency}${formatReportNumber(m.spend)}`,
};
/** The goal's result count (purchases or leads) under its own label. */
const results = (label: string): WeeklyGoalColumn => ({
  label,
  value: (m) => formatReportNumber(m.results, 1),
  className: "font-medium text-green-600",
});
/** Spend per result; a dash when the goal had no results. */
const costPerResult = (label: string, digits = 1): WeeklyGoalColumn => ({
  label,
  value: (m, currency) =>
    m.results > 0
      ? `${currency}${formatReportNumber(m.costPerResult, digits)}`
      : "—",
  className: "font-medium text-blue-600",
});

/** Each goal shows only its own metrics: no revenue or ROAS outside sales. */
export const WEEKLY_GOAL_COLUMNS: Record<
  ReportCampaignGoal,
  WeeklyGoalColumn[]
> = {
  ecommerce: [
    impressions,
    clicks,
    results("רכישות"),
    spend,
    costPerResult("עלות לרכישה"),
    {
      label: "הכנסה",
      value: (m, currency) =>
        m.revenue > 0 ? `${currency}${formatReportNumber(m.revenue)}` : "—",
    },
    {
      label: "ROAS",
      value: (m) => (m.roas > 0 ? `${formatReportNumber(m.roas, 2)}x` : "—"),
    },
  ],
  leads: [
    impressions,
    clicks,
    results("לידים"),
    spend,
    costPerResult("עלות לליד"),
  ],
  // A traffic campaign's result is the click itself.
  traffic: [
    impressions,
    { ...clicks, className: "font-medium text-green-600" },
    spend,
    costPerResult("עלות לקליק", 2),
  ],
};
