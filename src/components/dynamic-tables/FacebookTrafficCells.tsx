import { previousCellsFor } from "@/components/reports/PreviousPeriod/previousCells";
import {
  costPerFollower,
  formatFollowerCell,
  sumFacebookFollowers,
} from "@/lib/facebookFollowers";
import { formatReportNumber, ratio, resultCellClass } from "@/lib/reportNumber";
import type { FacebookReportCampaign } from "./facebookReportCampaigns";

type Rows = Array<FacebookReportCampaign>;

/** Metric cells of one campaign or, given every campaign, of the total row. */
export function TrafficCells({
  campaigns,
  previous,
  currency,
  withLeads,
  withFollowers,
  isTotal,
}: {
  campaigns: Rows;
  /** Null when the entity did not run then; undefined with comparison off. */
  previous: Rows | null | undefined;
  currency: string;
  withLeads: boolean;
  withFollowers: boolean;
  isTotal: boolean;
}) {
  const impressions = sumOf(campaigns, "impressions");
  const clicks = sumOf(campaigns, "clicks");
  const spend = sumOf(campaigns, "spend");
  const prev = previousCellsFor(campaigns, previous);
  /** An amount in the report's currency. */
  function money(value: number) {
    return `${currency}${formatReportNumber(value)}`;
  }
  return (
    <>
      <td className="p-2 text-center">{formatReportNumber(impressions)}</td>
      <td className={resultCellClass("text-green-600", isTotal)}>
        {formatReportNumber(clicks)}
      </td>
      {prev((rows) => sumOf(rows, "clicks"), formatReportNumber, "higher")}
      <td className="p-2 text-center">{money(spend)}</td>
      {prev((rows) => sumOf(rows, "spend"), money, "neutral")}
      <td className="p-2 text-center">
        {formatReportNumber(ratio(clicks, impressions) * 100, 2)}%
      </td>
      <td className={resultCellClass("text-blue-600", isTotal)}>
        {currency}
        {formatReportNumber(ratio(spend, clicks), 2)}
      </td>
      {prev(
        (rows) => ratio(sumOf(rows, "spend"), sumOf(rows, "clicks")),
        (value) => `${currency}${formatReportNumber(value, 2)}`,
        "lower",
      )}
      {withLeads && (
        <>
          <td className="p-2 text-center">
            {formatReportNumber(sumOf(campaigns, "leads"))}
          </td>
          {prev((rows) => sumOf(rows, "leads"), formatReportNumber, "higher")}
        </>
      )}
      {withFollowers && (
        <>
          <td className={resultCellClass("text-green-600", isTotal)}>
            {formatFollowerCell(
              sumFacebookFollowers(campaigns).newFollowers,
              formatReportNumber,
            )}
          </td>
          {prev(
            (rows) => sumFacebookFollowers(rows).newFollowers ?? 0,
            formatReportNumber,
            "higher",
          )}
          <td className={resultCellClass("text-blue-600", isTotal)}>
            {formatFollowerCell(
              costPerFollower(campaigns),
              (cost) => `${currency}${formatReportNumber(cost, 2)}`,
            )}
          </td>
        </>
      )}
    </>
  );
}

/** One number summed over the rows. */
function sumOf(
  rows: Rows,
  key: "impressions" | "clicks" | "spend" | "leads",
): number {
  return rows.reduce((total, row) => total + row[key], 0);
}
