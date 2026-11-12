import type { GoogleReportTable } from "@/lib/googleCampaignGoals";
import type { WooGoogleAttributionSummary } from "@/lib/wooAttribution";
import type { WooReportAttributionData } from "@/lib/wooDashboardQueries";

/** One stored report row (crm_records) as the goal tables read it. */
export type AdsReportRecord = { data: Record<string, unknown> };

/** The report table (crm_tables) the goal tables belong to. */
export type AdsReportTable = GoogleReportTable;

/**
 * WooCommerce order attribution that replaces a Google Ads sales report's
 * totals; null when the report does not use it.
 */
export type GoogleWooOverlay = {
  orders: WooReportAttributionData["orders"];
  googlePaid: WooGoogleAttributionSummary;
};

/** How the manual ROI card saves what a viewer enters. */
export type ManualRoiOptions = {
  readOnly?: boolean;
  /** Saves through a share link instead of the signed-in Supabase session. */
  saveFn?: (manualRoi: {
    closures: number | null;
    revenue: number | null;
  }) => Promise<void>;
};
