import { FacebookLeadsTable } from "@/components/dynamic-tables/FacebookLeadsTable";
import { FacebookSalesTable } from "@/components/dynamic-tables/FacebookSalesTable/FacebookSalesTable";
import { FacebookTrafficTable } from "@/components/dynamic-tables/FacebookTrafficTable";
import { facebookPreviousPeriod } from "@/components/dynamic-tables/facebookPreviousPeriod";
import { groupFacebookReportCampaigns } from "@/components/dynamic-tables/facebookReportCampaigns";
import type { AdsEntityLevel } from "@/lib/adsEntityLevel";
import { isFacebookLeadsOnlyTable } from "@/lib/adsMetrics";
import { reportOffLookup } from "@/lib/campaignOffState";
import type {
  AdsReportRecord,
  AdsReportTable,
  ManualRoiOptions,
} from "./adsGoalTablesTypes";
import { entityColumnLabel } from "./entityColumnLabel";
import { ReportManualRoi } from "./ReportManualRoi";

type Props = {
  table: AdsReportTable;
  records: Array<AdsReportRecord>;
  previousRecords: Array<AdsReportRecord> | undefined;
  level: AdsEntityLevel;
  currency: string;
  manualRoi: ManualRoiOptions;
};

/**
 * A Facebook report's campaigns, each under its report goal (AIO-494): sales,
 * leads and traffic tables, then the manual ROI card of the lead campaigns.
 */
export function FacebookGoalTables({
  table,
  records,
  previousRecords,
  level,
  currency,
  manualRoi,
}: Props) {
  const { ecommerce, leads, traffic } = groupCampaigns(table, records, level);
  // The previous period's rows, grouped the same way, while the comparison is on.
  const previous = previousRecords
    ? facebookPreviousPeriod(groupCampaigns(table, previousRecords, level))
    : null;
  const leadTotals = leads.reduce(
    (acc, [, campaign]) => ({
      spend: acc.spend + campaign.spend,
      leads: acc.leads + campaign.leads,
    }),
    { spend: 0, leads: 0 },
  );
  /** The name column's heading: the goal at the campaign level. */
  function entityHeader(suffix: string): string {
    return level === "campaign" ? `קמפיין ${suffix}` : entityColumnLabel(level);
  }

  return (
    <>
      {ecommerce.length > 0 && (
        <FacebookSalesTable
          rows={ecommerce}
          entityHeader={entityHeader("איקומרס")}
          currency={currency}
          previous={previous?.ecommerce}
        />
      )}
      {leads.length > 0 && (
        <FacebookLeadsTable
          rows={leads}
          entityHeader={entityHeader("לידים")}
          currency={currency}
          previous={previous?.leads}
        />
      )}
      {traffic.length > 0 && (
        <FacebookTrafficTable
          rows={traffic}
          entityHeader={entityHeader("טראפיק")}
          currency={currency}
          previous={previous?.traffic}
        />
      )}
      {leads.length > 0 && (
        <ReportManualRoi
          table={table}
          figures={leadTotals}
          currency={currency}
          options={manualRoi}
        />
      )}
    </>
  );
}

/**
 * Each campaign under its report goal; a leads-only table keeps every campaign
 * in leads (stray pixel purchases do not make it sales).
 */
function groupCampaigns(
  table: AdsReportTable,
  records: Array<AdsReportRecord>,
  level: AdsEntityLevel,
) {
  return groupFacebookReportCampaigns(records, level, {
    leadsOnly: isFacebookLeadsOnlyTable(table.integration_settings),
    isReportOff: reportOffLookup([table]),
  });
}
