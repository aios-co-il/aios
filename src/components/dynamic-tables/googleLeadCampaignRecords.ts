import {
  googleReportCampaignGoals,
  googleReportCampaignKey,
} from "@/lib/pulseCampaignGoals";

type ReportTable = Parameters<
  typeof googleReportCampaignGoals
>[0]["tables"][number];

/**
 * Records of a Google Ads report's lead campaigns. Sales campaigns' spend and
 * purchases are not leads, so lead-only figures (manual ROI) leave them out.
 */
export function googleLeadCampaignRecords<
  T extends { data?: Record<string, unknown> | null },
>(records: T[], table: ReportTable): T[] {
  const goals = googleReportCampaignGoals({
    records: records.map((record) => ({
      table_id: table.id,
      data: record.data,
    })),
    tables: [table],
  });
  const fallback =
    table.integration_settings?.campaign_type === "ecommerce"
      ? "ecommerce"
      : "leads";
  return records.filter(
    (record) =>
      (goals.get(googleReportCampaignKey(record.data)) ?? fallback) === "leads",
  );
}
