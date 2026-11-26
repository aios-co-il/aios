import { googleManualRoiFigures } from "@/components/dynamic-tables/googleLeadCampaignRecords";
import type { AdsEntityLevel } from "@/lib/adsEntityLevel";
import { getCurrencySymbol } from "@/lib/currency";
import {
  AdPreviewContext,
  type AdPreviewSource,
} from "../AdPreview/AdPreviewContext";
import type {
  AdsReportRecord,
  AdsReportTable,
  GoogleWooOverlay,
  ManualRoiOptions,
} from "./adsGoalTablesTypes";
import { FacebookGoalTables } from "./FacebookGoalTables";
import { GoogleGoalTables } from "./GoogleGoalTables";
import { ReportManualRoi } from "./ReportManualRoi";

type Props = {
  table: AdsReportTable;
  /** The period's rows at the entity level, after any search. */
  records: Array<AdsReportRecord>;
  /** The previous period's rows the same way; undefined while the comparison is off. */
  previousRecords: Array<AdsReportRecord> | undefined;
  level: AdsEntityLevel;
  /** WooCommerce attribution for a Google Ads sales report; null without it. */
  woo: GoogleWooOverlay | null;
  manualRoi: ManualRoiOptions;
  /** The notes on suspicious Google conversion values, meant for the agency. */
  showTrackingWarnings: boolean;
  /** Where a Facebook ad row's name opens its preview; null for no previews. */
  adPreview: AdPreviewSource | null;
};

/**
 * The goal tables of a single ads report, shared by the internal report page
 * and its share link so a design fix reaches both: Facebook sales, leads and
 * traffic tables, or Google Ads tables per campaign goal, each with its
 * previous-period columns while the comparison is on, and the manual ROI card.
 * A Facebook ad row's name opens the ad's preview from both pages, and a
 * Google ad row with stored copy opens its drawn card.
 */
export function AdsGoalTables({
  table,
  records,
  previousRecords,
  level,
  woo,
  manualRoi,
  showTrackingWarnings,
  adPreview,
}: Props) {
  const currencyCode = table.integration_settings?.currency;
  const currency = getCurrencySymbol(
    typeof currencyCode === "string" ? currencyCode : null,
  );
  const integrationType = table.integration_type;
  if (
    integrationType === "facebook_insights" ||
    integrationType === "facebook_ecommerce"
  ) {
    return records.length > 0 ? (
      <AdPreviewContext.Provider value={adPreview}>
        <FacebookGoalTables
          table={table}
          records={records}
          previousRecords={previousRecords}
          level={level}
          currency={currency}
          manualRoi={manualRoi}
        />
      </AdPreviewContext.Provider>
    ) : null;
  }
  if (integrationType !== "google_ads") {
    return null;
  }
  // Lead campaigns only; kept for entered figures when the range has none.
  const roiFigures = googleManualRoiFigures(records, table);
  return (
    <>
      {records.length > 0 && (
        <GoogleGoalTables
          table={table}
          records={records}
          previousRecords={previousRecords}
          level={level}
          currency={currency}
          woo={woo}
          showTrackingWarnings={showTrackingWarnings}
        />
      )}
      {roiFigures && (
        <ReportManualRoi
          table={table}
          figures={roiFigures}
          currency={currency}
          options={manualRoi}
        />
      )}
    </>
  );
}
