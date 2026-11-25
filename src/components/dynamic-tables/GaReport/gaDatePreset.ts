import {
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";

/** The date presets the Google Analytics report can show. */
export type GaDatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "last_7_days"
  | "last_9_days"
  | "last_14_days"
  | "last_30_days"
  | "last_60_days"
  | "last_70_days"
  | "last_120_days"
  | "this_month"
  | "last_month"
  | "last_90_days"
  | "last_180_days"
  | "last_365_days"
  | "custom";

export type GaDateRange = { start: Date; end: Date };

/** Rolling presets: how many full days they cover, ending yesterday. */
const ROLLING_PRESET_DAYS: Partial<Record<GaDatePreset, number>> = {
  last_7_days: 7,
  last_9_days: 9,
  last_14_days: 14,
  last_30_days: 30,
  last_60_days: 60,
  last_70_days: 70,
  last_90_days: 90,
  last_120_days: 120,
  last_180_days: 180,
  last_365_days: 365,
};

const PRESETS = new Set<string>([
  "all",
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "custom",
  ...Object.keys(ROLLING_PRESET_DAYS),
]);

/**
 * The report's preset for the dashboard's date filter. An unknown or missing
 * filter falls back to the last 7 days.
 */
export function mapExternalGaPreset(external?: string): GaDatePreset {
  return external && isGaDatePreset(external) ? external : "last_7_days";
}

/**
 * The window a non-custom preset covers on the browser's calendar.
 * STANDARD (mem://ui/date-range-calculation-standard): relative ranges
 * (last_N_days) END YESTERDAY (today excluded — partial data), matching Google
 * Ads, GA's own "Last N days", crm-records, WooCommerceDashboard and
 * DashboardView.wooDateRange. Absolute presets (today, this_week, this_month)
 * include today. Unknown presets cover the last 30 days.
 */
export function gaPresetRange(
  preset: GaDatePreset,
  now: Date = new Date(),
): GaDateRange {
  const today = new Date(now);
  today.setHours(23, 59, 59, 999);
  const yesterday = subDays(today, 1);
  yesterday.setHours(23, 59, 59, 999);

  const rollingDays = ROLLING_PRESET_DAYS[preset];
  if (rollingDays !== undefined) {
    return { start: subDays(today, rollingDays), end: yesterday };
  }

  switch (preset) {
    case "all": {
      const allStart = new Date("2020-01-01");
      allStart.setHours(0, 0, 0, 0);
      return { start: allStart, end: today };
    }
    case "today": {
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      return { start: todayStart, end: today };
    }
    case "yesterday": {
      const yesterdayStart = subDays(today, 1);
      yesterdayStart.setHours(0, 0, 0, 0);
      return { start: yesterdayStart, end: yesterday };
    }
    case "this_week":
      return { start: startOfWeek(today, { weekStartsOn: 0 }), end: today };
    case "last_week": {
      const prevWeekRef = subDays(today, 7);
      return {
        start: startOfWeek(prevWeekRef, { weekStartsOn: 0 }),
        end: endOfWeek(prevWeekRef, { weekStartsOn: 0 }),
      };
    }
    case "this_month":
      return { start: startOfMonth(today), end: today };
    case "last_month": {
      const lastMonth = subMonths(today, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    }
    default:
      return { start: subDays(today, 30), end: yesterday };
  }
}

/** Whether a dashboard filter value is one of the report's presets. */
function isGaDatePreset(value: string): value is GaDatePreset {
  return PRESETS.has(value);
}
