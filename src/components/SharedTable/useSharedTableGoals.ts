import { useMemo } from "react";
import {
  googleCampaignGoalOf,
  type GoogleAdsRowData,
  type GoogleReportRecord,
  type GoogleReportTable,
} from "@/lib/googleCampaignGoals";
import type { GoogleGoalPresence } from "@/lib/googleGoalPresence";
import type {
  GoogleCampaignGoal,
  GoogleReportGoal,
} from "../../../supabase/functions/_shared/campaign-goal/google-classify.ts";

export type SharedTableGoals = GoogleGoalPresence & {
  /** Goal of a Google Ads row's campaign; null when the table is not a Google Ads table. */
  goalOf: ((data?: GoogleAdsRowData | null) => GoogleReportGoal) | null;
};

/**
 * Which goals a shared table shows. A Google Ads table decides per campaign by
 * the pulse rules, with `tableMode` for rows the rules cannot key; any other
 * table shows its own mode.
 */
export function useSharedTableGoals(
  records: GoogleReportRecord[] | undefined,
  googleTable: GoogleReportTable | null | undefined,
  tableMode: GoogleCampaignGoal,
): SharedTableGoals {
  return useMemo(() => {
    if (!googleTable?.id) {
      return {
        goalOf: null,
        hasEcommerce: tableMode === "ecommerce",
        hasLeads: tableMode === "leads",
        hasTraffic: false,
      };
    }
    return googleCampaignGoalOf(
      (records || []).map((record) => ({
        table_id: googleTable.id,
        data: record.data,
      })),
      [googleTable],
      tableMode,
    );
  }, [records, googleTable, tableMode]);
}
