import { type AdsEntityLevel, getEntityGroupKey } from "@/lib/adsEntityLevel";
import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";
import {
  type GoogleGoalMetrics,
  type GoogleTablePrevious,
  sumGoogleMetrics,
} from "./googleGoalMetrics";

type GoogleRecord = { data: Record<string, unknown> };

/**
 * One stored Google Ads row's numbers as the report counts them: conversions
 * fall back to purchases and value to purchase value on older rows.
 */
export function googleRecordMetrics(
  data: Record<string, unknown> | null | undefined,
): GoogleGoalMetrics {
  return {
    impressions: Number(data?.impressions) || 0,
    clicks: Number(data?.clicks) || 0,
    conversions: Number(data?.conversions) || Number(data?.purchases) || 0,
    cost: Number(data?.cost) || 0,
    conversions_value:
      Number(data?.conversions_value) || Number(data?.purchase_value) || 0,
  };
}

/**
 * The previous period's numbers per entity and per goal table. An entity is
 * looked up by key whatever goal it had then; each table's total adds up the
 * previous rows of its own goal.
 */
export function googlePreviousPeriod(
  records: Array<GoogleRecord>,
  level: AdsEntityLevel,
  goalOf: (data: Record<string, unknown>) => GoogleReportGoal,
): Record<GoogleReportGoal, GoogleTablePrevious> {
  const byKey = new Map<string, GoogleGoalMetrics>();
  const goalByKey = new Map<string, GoogleReportGoal>();
  for (const record of records) {
    const key = getEntityGroupKey(record.data, level);
    byKey.set(
      key,
      sumGoogleMetrics([
        byKey.get(key) ?? sumGoogleMetrics([]),
        googleRecordMetrics(record.data),
      ]),
    );
    if (!goalByKey.has(key)) {
      goalByKey.set(key, goalOf(record.data));
    }
  }
  /** One table's previous numbers with the shared lookup. */
  function tableOf(goal: GoogleReportGoal): GoogleTablePrevious {
    const rows = [...byKey].filter(([key]) => goalByKey.get(key) === goal);
    return { byKey, total: sumGoogleMetrics(rows.map(([, row]) => row)) };
  }
  return {
    ecommerce: tableOf("ecommerce"),
    leads: tableOf("leads"),
    traffic: tableOf("traffic"),
  };
}
