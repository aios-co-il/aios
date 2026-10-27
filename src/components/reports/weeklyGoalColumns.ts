import { formatReportNumber } from "@/lib/reportTableFormat";
import {
  FOLLOWER_COLUMN_LABELS,
  formatFollowerCell,
  showsFollowerColumns,
} from "@/lib/facebookFollowers";
import type { WeeklyCampaignKind } from "@/lib/weeklyAdsComparison";
import type {
  WeeklyGoalGroup,
  WeeklyGoalTotals,
} from "@/lib/weeklyCampaignGoals";

/** One metric column of a weekly goal table. */
export type WeeklyGoalColumn = {
  label: string;
  value: (metrics: WeeklyGoalTotals, currency: string) => string;
  className?: string;
};

/**
 * The columns of one goal's weekly table. A traffic table adds new followers
 * and cost per follower once a campaign sends people to a Page or profile.
 */
export function weeklyGoalColumnsFor(
  group: WeeklyGoalGroup,
): WeeklyGoalColumn[] {
  const columns = WEEKLY_GOAL_COLUMNS[group.kind];
  if (group.kind === "traffic" && showsFollowerColumns(group.rows)) {
    return [...columns, newFollowersColumn, costPerFollowerColumn];
  }
  return columns;
}

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
const WEEKLY_GOAL_COLUMNS: Record<WeeklyCampaignKind, WeeklyGoalColumn[]> = {
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

const newFollowersColumn: WeeklyGoalColumn = {
  label: FOLLOWER_COLUMN_LABELS.newFollowers,
  value: (m) =>
    formatFollowerCell(m.followers.newFollowers, formatReportNumber),
  className: "font-medium text-green-600",
};
/** Spend per new follower; a dash when the campaigns gained none. */
const costPerFollowerColumn: WeeklyGoalColumn = {
  label: FOLLOWER_COLUMN_LABELS.costPerFollower,
  value: (m, currency) =>
    formatFollowerCell(
      m.costPerFollower,
      (cost) => `${currency}${formatReportNumber(cost, 2)}`,
    ),
  className: "font-medium text-blue-600",
};
