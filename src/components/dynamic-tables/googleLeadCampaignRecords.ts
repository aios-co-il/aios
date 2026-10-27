import {
  googleCampaignGoalOf,
  type GoogleAdsRowData,
  type GoogleReportTable,
} from "@/lib/googleCampaignGoals";
import { googleReportFallbackGoal } from "@/lib/googleGoalPresence";

/**
 * Records of a Google Ads report's lead campaigns. Sales campaigns' spend and
 * purchases are not leads, so lead-only figures (manual ROI) leave them out.
 */
export function googleLeadCampaignRecords<
  T extends { data?: GoogleAdsRowData | null },
>(records: T[], table: GoogleReportTable): T[] {
  const { goalOf } = googleCampaignGoalOf(
    records.map((record) => ({ table_id: table.id, data: record.data })),
    [table],
    googleReportFallbackGoal([table]),
  );
  return records.filter((record) => goalOf(record.data) === "leads");
}
