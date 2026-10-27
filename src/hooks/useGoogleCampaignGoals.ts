import { useMemo } from "react";
import {
  googleCampaignGoalOf,
  type GoogleCampaignGoalLookup,
  type GoogleReportCampaignGoal,
  type GoogleReportRecord,
  type GoogleReportTable,
} from "@/lib/googleCampaignGoals";

/**
 * Goal of each Google Ads campaign in one report table's records, or null when
 * no Google Ads table is given. `tableMode` covers rows the rules cannot key.
 */
export function useGoogleCampaignGoals(
  records: GoogleReportRecord[] | undefined,
  table: GoogleReportTable | null | undefined,
  tableMode: GoogleReportCampaignGoal,
): GoogleCampaignGoalLookup | null {
  return useMemo(() => {
    if (!table?.id) {
      return null;
    }
    return googleCampaignGoalOf(
      (records || []).map((record) => ({
        table_id: table.id,
        data: record.data,
      })),
      [table],
      tableMode,
    );
  }, [records, table, tableMode]);
}
