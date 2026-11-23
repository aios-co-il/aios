import { useMemo } from "react";
import { getCurrencySymbol } from "@/lib/currency";
import { META_SOURCES } from "@/lib/dashboardCampaignGoals";
import type {
  GoogleReportRecord,
  GoogleReportTable,
} from "@/lib/googleCampaignGoals";
import { summarizeGoogleAdsCampaigns } from "../GoogleAdsCampaignSection/summarizeGoogleAdsCampaigns";
import { CampaignContinentsTab } from "./CampaignContinentsTab";
import { FacebookTableContinentsView } from "./FacebookTableContinentsView";

type Props = {
  /** The Google Ads table's records for the selected period. */
  records: Array<GoogleReportRecord>;
  table: GoogleReportTable & {
    integration_settings?: Record<string, unknown> | null;
  };
};

/**
 * The "לפי יבשות" tab of a Google Ads or Facebook table report: the same
 * continent summary and tables as the dashboard's tab for that platform,
 * from this table's records.
 */
export function TableContinentsView({ records, table }: Props) {
  if (META_SOURCES.has(table.integration_type ?? "")) {
    return <FacebookTableContinentsView records={records} table={table} />;
  }
  return <GoogleTableContinentsView records={records} table={table} />;
}

/** The Google Ads table's continents view. */
function GoogleTableContinentsView({ records, table }: Props) {
  const campaigns = useMemo(
    () => summarizeGoogleAdsCampaigns(records, [table]).campaigns,
    [records, table],
  );
  const symbol = getCurrencySymbol(
    typeof table.integration_settings?.currency === "string"
      ? table.integration_settings.currency
      : null,
  );
  return (
    <CampaignContinentsTab
      campaigns={campaigns}
      formatCurrency={(value) =>
        `${symbol}${Math.round(value).toLocaleString("en-US")}`
      }
      formatNumber={(value) => Math.round(value).toLocaleString("en-US")}
      formatUnitCost={(value) => `${symbol}${value.toFixed(2)}`}
    />
  );
}
