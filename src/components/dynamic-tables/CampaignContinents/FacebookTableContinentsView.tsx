import { useMemo } from "react";
import { shouldIncludeInAdsDashboardAggregate } from "@/lib/adsEntityLevel";
import type { CampaignOffTable } from "@/lib/campaignOffState";
import {
  dashboardFacebookCampaigns,
  dashboardRecordGoalOf,
  type DashboardAdsRecord,
} from "@/lib/dashboardCampaignGoals";
import { normalizeCurrencyCode } from "@/lib/currency";
import { moneyFormatters } from "@/lib/dashboardCurrencies";
import type { CampaignGoalTable } from "@functions/_shared/campaign-goal/campaign-goals.ts";
import { FacebookContinentsTab } from "./FacebookContinentsTab";

type Props = {
  /** The Facebook table's records for the selected period. */
  records: Array<{ data?: Record<string, unknown> | null }>;
  table: CampaignGoalTable & CampaignOffTable;
};

/**
 * The "לפי יבשות" tab of a Facebook table report, internal or shared: the
 * dashboard's Meta continents view from this table's campaign rows, in the
 * table's currency.
 */
export function FacebookTableContinentsView({ records, table }: Props) {
  const tagged = useMemo(() => tagRecords(records, table), [records, table]);
  const campaigns = useMemo(
    () =>
      dashboardFacebookCampaigns(
        tagged,
        dashboardRecordGoalOf(tagged, [table]),
      ),
    [tagged, table],
  );
  const currency = normalizeCurrencyCode(
    typeof table.integration_settings?.currency === "string"
      ? table.integration_settings.currency
      : null,
  );
  return (
    <FacebookContinentsTab
      campaigns={campaigns}
      records={tagged}
      tables={[table]}
      formatNumber={(value) => Math.round(value).toLocaleString("he-IL")}
      {...moneyFormatters(currency)}
    />
  );
}

/** The table's campaign rows, tagged with its source as the dashboards tag them. */
function tagRecords(
  records: Props["records"],
  table: Props["table"],
): Array<DashboardAdsRecord> {
  const source = table.integration_type ?? "";
  return records
    .filter((record) =>
      shouldIncludeInAdsDashboardAggregate(record.data, source),
    )
    .map((record) => ({ ...record, _source: source, _tableId: table.id }));
}
