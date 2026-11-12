import type { AdsReportView } from "@/components/dynamic-tables/CampaignContinents/useContinentsReportView";
import { TableContinentsView } from "@/components/dynamic-tables/CampaignContinents/TableContinentsView";
import type { SharedTableInfo, SharedTableRecord } from "./publicTableApi";
import { isAdsPlatform } from "./sharedIntegrationReport";
import { SharedWeeklyView } from "./SharedWeeklyView";

type OtherViewProps = {
  view: AdsReportView;
  hasContinents: boolean;
  shareToken: string;
  table: SharedTableInfo;
  records: Array<SharedTableRecord>;
};

/** The ads report's views other than the report: continents and the weekly comparison. */
export function SharedAdsOtherView({
  view,
  hasContinents,
  shareToken,
  table,
  records,
}: OtherViewProps) {
  if (view === "continents" && hasContinents) {
    return <TableContinentsView records={records} table={table} />;
  }
  const source = table.integration_type || "";
  if (view === "weekly" && isAdsPlatform(source)) {
    return (
      <SharedWeeklyView shareToken={shareToken} table={table} source={source} />
    );
  }
  return null;
}

/** Said when the compared period could not be loaded. */
export function PreviousPeriodFailed() {
  return (
    <p className="text-sm text-destructive">לא ניתן לטעון את התקופה הקודמת.</p>
  );
}

/** The share's footer: the row count, the report and the agency. */
export function SharedReportFooter({
  rows,
  table,
}: {
  rows: number;
  table: SharedTableInfo;
}) {
  return (
    <p className="text-center text-xs text-muted-foreground">
      {rows} שורות • {table.name} • Powered by{" "}
      {table.agency_name || "Marketing Captain"}
    </p>
  );
}
