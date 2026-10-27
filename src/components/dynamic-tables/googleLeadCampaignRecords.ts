import {
  googleCampaignGoalOf,
  type GoogleAdsRowData,
  type GoogleReportTable,
} from "@/lib/googleCampaignGoals";
import { googleReportFallbackGoal } from "@/lib/googleGoalPresence";
import { hasManualRoiData } from "./manualRoi";

/**
 * Spend and leads behind a Google Ads report's manual ROI card, or null to
 * hide it. A sales table has no card; otherwise only lead campaigns count, and
 * with none in the range the card stays for figures someone entered.
 */
export function googleManualRoiFigures(
  records: Array<{
    data?: (GoogleAdsRowData & { purchases?: number | string }) | null;
  }>,
  table: GoogleReportTable,
): { spend: number; leads: number } | null {
  if (records.length === 0) {
    return null;
  }
  if (table.integration_settings?.campaign_type === "ecommerce") {
    return null;
  }
  const leadRecords = googleLeadCampaignRecords(records, table);
  if (
    leadRecords.length === 0 &&
    !hasManualRoiData(table.integration_settings)
  ) {
    return null;
  }
  let spend = 0;
  let leads = 0;
  for (const { data } of leadRecords) {
    spend += Number(data?.cost) || 0;
    leads += Number(data?.conversions) || Number(data?.purchases) || 0;
  }
  return { spend, leads: Math.round(leads) };
}

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
