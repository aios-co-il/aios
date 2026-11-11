import { REPORT_POSITIVE } from "@/components/report-ui/ReportTable";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import { costPerPurchase } from "@/lib/dashboardCombinedFigures";
import {
  costPerFollower,
  FOLLOWER_COLUMN_LABELS,
  formatFollowerCell,
  showsFollowerColumns,
  sumFacebookFollowers,
} from "@/lib/facebookFollowers";
import { ratio } from "@/lib/reportNumber";
import type { FacebookColumn } from "./FacebookGoalTable";
import { roasText, roasTone } from "./facebookRoas";
import { facebookTabTotals } from "./facebookTabFigures";

/** The formatters both dashboard pages pass to the tab. */
export type FacebookTabFormatters = {
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
  /** Cost per click and per follower, often under one currency unit. */
  formatUnitCost: (value: number) => string;
};

/**
 * The sales table's columns. When none of the campaigns reports a purchase
 * value (a free course, say), purchases are measured like leads: by cost per
 * purchase, with no purchase-value or ROAS column. Otherwise a campaign whose
 * purchases carry no value shows a dash for ROAS, and one that sold nothing
 * keeps its 0x.
 */
export function salesColumns(
  campaigns: Array<FacebookCampaignRow>,
  { formatCurrency, formatNumber }: FacebookTabFormatters,
): Array<FacebookColumn> {
  const valued = campaigns.some((campaign) => campaign.purchase_value > 0);
  const value: Array<FacebookColumn> = valued
    ? [
        {
          label: "ערך רכישות",
          value: (rows) => formatCurrency(sum(rows).purchase_value),
          tone: (rows) => positive(sum(rows).purchase_value),
        },
        { label: "ROAS", value: roasText, tone: roasTone },
      ]
    : [
        {
          label: "עלות לרכישה",
          value: (rows) => {
            const cost = costPerPurchase(sum(rows));
            return cost === null ? "-" : formatCurrency(cost);
          },
        },
      ];
  return [
    ...deliveryColumns(formatNumber),
    { label: "הוצאה", value: (rows) => formatCurrency(sum(rows).spend) },
    {
      label: "הוספות לעגלה",
      value: (rows) => formatNumber(sum(rows).add_to_cart),
      tone: (rows) => positive(sum(rows).add_to_cart),
    },
    {
      label: "רכישות",
      value: (rows) => formatNumber(sum(rows).purchases),
      tone: (rows) => positive(sum(rows).purchases),
    },
    ...value,
  ];
}

/** The leads table's columns, as the dashboards showed them. */
export function leadsColumns({
  formatCurrency,
  formatNumber,
}: FacebookTabFormatters): Array<FacebookColumn> {
  return [
    ...deliveryColumns(formatNumber),
    {
      label: "לידים",
      value: (rows) => formatNumber(sum(rows).leads),
      tone: (rows) => positive(sum(rows).leads),
    },
    { label: "הוצאה", value: (rows) => formatCurrency(sum(rows).spend) },
    {
      label: "עלות לליד",
      value: (rows) => {
        const cpl = ratio(sum(rows).spend, sum(rows).leads);
        return cpl > 0 ? formatCurrency(cpl) : "-";
      },
    },
  ];
}

/**
 * The traffic table's columns: a click is their result, so CTR and cost per
 * click, plus leads once a campaign measured any and new followers once a
 * campaign sends people to a Page or profile.
 */
export function trafficColumns(
  campaigns: Array<FacebookCampaignRow>,
  { formatCurrency, formatNumber, formatUnitCost }: FacebookTabFormatters,
): Array<FacebookColumn> {
  const columns: Array<FacebookColumn> = [
    { label: "הוצאה", value: (rows) => formatCurrency(sum(rows).spend) },
    ...deliveryColumns(formatNumber),
    {
      label: "CTR",
      value: (rows) =>
        `${(ratio(sum(rows).clicks, sum(rows).impressions) * 100).toFixed(2)}%`,
    },
    {
      label: "עלות לקליק",
      value: (rows) => formatUnitCost(ratio(sum(rows).spend, sum(rows).clicks)),
    },
  ];
  if (campaigns.some((campaign) => campaign.leads > 0)) {
    columns.push({
      label: "לידים",
      value: (rows) => formatNumber(sum(rows).leads),
    });
  }
  if (showsFollowerColumns(campaigns)) {
    columns.push(
      {
        label: FOLLOWER_COLUMN_LABELS.newFollowers,
        value: (rows) =>
          formatFollowerCell(
            sumFacebookFollowers(rows).newFollowers,
            formatNumber,
          ),
      },
      {
        label: FOLLOWER_COLUMN_LABELS.costPerFollower,
        value: (rows) =>
          formatFollowerCell(costPerFollower(rows), formatUnitCost),
      },
    );
  }
  return columns;
}

/** Impressions and clicks. */
function deliveryColumns(
  formatNumber: (value: number) => string,
): Array<FacebookColumn> {
  return [
    { label: "חשיפות", value: (rows) => formatNumber(sum(rows).impressions) },
    { label: "קליקים", value: (rows) => formatNumber(sum(rows).clicks) },
  ];
}

/** The campaigns' figures added up. */
function sum(rows: Array<FacebookCampaignRow>) {
  return facebookTabTotals(rows);
}

/** The accent for a result above zero. */
function positive(value: number): string | undefined {
  return value > 0 ? REPORT_POSITIVE : undefined;
}
