import { useMemo, useState } from "react";
import { useContinentsReportView } from "@/components/dynamic-tables/CampaignContinents/useContinentsReportView";
import { TableContinentsView } from "@/components/dynamic-tables/CampaignContinents/TableContinentsView";
import { previousReportRecords } from "@/components/reports/PreviousPeriod/previousReportRecords";
import {
  type AdsEntityLevel,
  filterRecordsByEntityLevel,
} from "@/lib/adsEntityLevel";
import type { SharedTableInfo, SharedTablePayload } from "./publicTableApi";
import { SharedAdsSummary } from "./SharedAdsSummary";
import { SharedAnalyticsDaily } from "./SharedAnalyticsDaily";
import { makeFormatCurrency } from "./sharedFormat";
import { SharedGenericTable } from "./SharedGenericTable";
import { isAdsPlatform, isAnalyticsPlatform } from "./sharedIntegrationReport";
import { SharedKpiCards } from "./SharedKpiCards";
import { SharedReportHeader } from "./SharedReportHeader";
import { SharedWeeklyView } from "./SharedWeeklyView";
import { useSharedKpiSummary } from "./useSharedKpiSummary";
import { useSharedPreviousPeriod } from "./useSharedPreviousPeriod";
import type { SharedDateSelection } from "./useSharedTableData";

type Props = {
  shareToken: string;
  data: SharedTablePayload;
  table: SharedTableInfo;
  dates: SharedDateSelection;
  onDatesChange: (dates: SharedDateSelection) => void;
  /** The period's records have loaded (not refetching another window). */
  ready: boolean;
};

/**
 * An ads, analytics or plain table share: the internal report's header, goal
 * tables and previous-period comparison, with the share's KPI cards.
 */
export function SharedDataReport({
  shareToken,
  data,
  table,
  dates,
  onDatesChange,
  ready,
}: Props) {
  const integrationType = table.integration_type || "";
  const isAds = isAdsPlatform(integrationType);
  const isAnalytics = isAnalyticsPlatform(integrationType);
  const [level, setLevel] = useState<AdsEntityLevel>("campaign");
  const [comparePrevious, setComparePrevious] = useState(false);
  const allRecords = useMemo(() => data.records || [], [data.records]);
  // No pre-filter by report_type, like the internal report; the edge function
  // applies the date window the internal report uses.
  const levelRecords = useMemo(
    () => (isAds ? filterRecordsByEntityLevel(allRecords, level) : allRecords),
    [allRecords, isAds, level],
  );
  const views = useContinentsReportView({
    integrationType,
    records: allRecords,
    ready,
  });
  const showSummary = !isAds || views.view === "summary";
  const previousPeriod = useSharedPreviousPeriod(
    shareToken,
    dates,
    comparePrevious && isAds && showSummary,
  );
  // Both windows must be loaded before they are compared.
  const previousRecords =
    previousPeriod.records && ready
      ? previousReportRecords(previousPeriod.records, level, {
          searching: false,
          shown: levelRecords,
        })
      : undefined;
  const kpis = useSharedKpiSummary(table, allRecords, levelRecords, level);
  const formatCurrency = makeFormatCurrency(
    table.integration_settings?.currency,
  );

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <SharedReportHeader
          table={table}
          dates={dates}
          onDatesChange={onDatesChange}
          views={
            isAds
              ? {
                  value: views.view,
                  onChange: views.setView,
                  hasContinents: views.hasContinentsTab,
                }
              : null
          }
          comparison={
            isAds && showSummary
              ? {
                  on: comparePrevious,
                  onChange: setComparePrevious,
                  period: previousPeriod,
                }
              : null
          }
        />
        {previousPeriod.failed && (
          <p className="text-sm text-destructive">
            לא ניתן לטעון את התקופה הקודמת.
          </p>
        )}
        {isAds && views.hasContinentsTab && views.view === "continents" && (
          <TableContinentsView records={allRecords} table={table} />
        )}
        {isAdsPlatform(integrationType) && views.view === "weekly" && (
          <SharedWeeklyView
            shareToken={shareToken}
            table={table}
            source={integrationType}
          />
        )}
        {showSummary && (isAds || isAnalytics) && kpis.summary && (
          <SharedKpiCards
            summary={kpis.summary}
            isAds={isAds}
            isAnalytics={isAnalytics}
            isGoogleAds={integrationType === "google_ads"}
            leadsOnly={kpis.leadsOnly}
            formatCurrency={formatCurrency}
          />
        )}
        {isAds && showSummary && (
          <SharedAdsSummary
            shareToken={shareToken}
            table={table}
            allRecords={allRecords}
            levelRecords={levelRecords}
            previousRecords={previousRecords}
            level={level}
            onLevelChange={setLevel}
          />
        )}
        {isAnalytics && levelRecords.length > 0 && (
          <SharedAnalyticsDaily
            records={levelRecords}
            formatCurrency={formatCurrency}
          />
        )}
        {!isAds && !isAnalytics && (
          <SharedGenericTable fields={data.fields} records={levelRecords} />
        )}
        <p className="text-center text-xs text-muted-foreground">
          {levelRecords.length} שורות • {table.name} • Powered by{" "}
          {table.agency_name || "Marketing Captain"}
        </p>
      </div>
    </div>
  );
}
