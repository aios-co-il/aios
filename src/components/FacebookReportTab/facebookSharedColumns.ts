import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import type { facebookCompare } from "./facebookCompare";
import type { FacebookColumn } from "./FacebookGoalTable";
import { facebookTabTotals } from "./facebookTabFigures";

type FacebookCompare = ReturnType<typeof facebookCompare>;

/** Impressions and clicks. */
export function deliveryColumns(
  formatNumber: (value: number) => string,
  cmp: FacebookCompare,
): Array<FacebookColumn> {
  return [
    { label: "חשיפות", value: (rows) => formatNumber(sum(rows).impressions) },
    {
      label: "קליקים",
      value: (rows) => formatNumber(sum(rows).clicks),
      compare: cmp.clicks,
    },
  ];
}

/** Spend. */
export function spendColumn(
  formatCurrency: (value: number) => string,
  cmp: FacebookCompare,
): FacebookColumn {
  return {
    label: "הוצאה",
    value: (rows) => formatCurrency(sum(rows).spend),
    compare: cmp.spend,
  };
}

/** The campaigns' figures added up. */
function sum(rows: Array<FacebookCampaignRow>) {
  return facebookTabTotals(rows);
}
