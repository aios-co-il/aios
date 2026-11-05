import { useMemo } from "react";
import {
  googleCampaignGoalsForRecords,
  type GoogleReportTable,
} from "@/lib/googleCampaignGoals";
import type {
  WeeklyAdsRecord,
  WeeklyAdsSource,
} from "@/lib/weeklyAdsComparison";

/**
 * Goal per Google Ads campaign of the weekly comparison's records, so each
 * Google campaign shows by its own goal. Undefined without the report's tables.
 */
export function useWeeklyGoogleCampaignGoals(
  records: WeeklyAdsRecord[],
  tables: GoogleReportTable[] | undefined,
  defaultSource: WeeklyAdsSource | undefined,
) {
  return useMemo(
    () =>
      tables
        ? googleCampaignGoalsForRecords(
            records.filter(
              (record) => (record._source ?? defaultSource) === "google_ads",
            ),
            tables,
          )
        : undefined,
    [records, tables, defaultSource],
  );
}
