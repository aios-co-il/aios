import {
  changeMarksFor,
  previousCellsFor,
} from "@/components/reports/PreviousPeriod/previousCells";
import {
  costPerFollower,
  formatFollowerCell,
  sumFacebookFollowers,
} from "@/lib/facebookFollowers";
import { formatReportNumber, ratio, resultCellClass } from "@/lib/reportNumber";
import type { FacebookReportCampaign } from "./facebookReportCampaigns";
import { MarkedCell } from "./MarkedCell";

type Rows = Array<FacebookReportCampaign>;

/**
 * Metric cells of one campaign or, given every campaign, of the total row.
 * A compared metric carries its change arrow and colour on the current value.
 */
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
  const clicks = clicksOf(campaigns);
  const spend = spendOf(campaigns);
  const newFollowers = newFollowersOf(campaigns);
  const prev = previousCellsFor(campaigns, previous);
  const mark = changeMarksFor(campaigns, previous);
  // An unmeasured current count shows a dash, with nothing to mark.
  const followersMark =
    newFollowers === null ? null : mark(newFollowersOf, "higher");
  /** An amount in the report's currency. */
  function money(value: number) {
    return `${currency}${formatReportNumber(value)}`;
  }
  /** A result-toned cell's classes. */
  function resultClass(color: string) {
    return resultCellClass(color, isTotal);
  }
  return (
    <>
      <td className="p-2 text-center">{formatReportNumber(impressions)}</td>
      <MarkedCell
        className={resultClass("text-green-600")}
        mark={mark(clicksOf, "higher")}
      >
        {formatReportNumber(clicks)}
      </MarkedCell>
      {prev(clicksOf, formatReportNumber, "higher")}
      <MarkedCell className="p-2 text-center" mark={mark(spendOf, "neutral")}>
        {money(spend)}
      </MarkedCell>
      {prev(spendOf, money, "neutral")}
      <td className="p-2 text-center">
        {formatReportNumber(ratio(clicks, impressions) * 100, 2)}%
      </td>
      <MarkedCell
        className={resultClass("text-blue-600")}
        mark={mark(costPerClick, "lower")}
      >
        {currency}
        {formatReportNumber(costPerClick(campaigns), 2)}
      </MarkedCell>
      {prev(
        costPerClick,
        (value) => `${currency}${formatReportNumber(value, 2)}`,
        "lower",
      )}
      {withLeads && (
        <>
          <MarkedCell
            className="p-2 text-center"
            mark={mark(leadsOf, "higher")}
          >
            {formatReportNumber(leadsOf(campaigns))}
          </MarkedCell>
          {prev(leadsOf, formatReportNumber, "higher")}
        </>
      )}
      {withFollowers && (
        <>
          <MarkedCell
            className={resultClass("text-green-600")}
            mark={followersMark}
          >
            {formatFollowerCell(newFollowers, formatReportNumber)}
          </MarkedCell>
          {prev(newFollowersOf, formatReportNumber, "higher")}
          <td className={resultClass("text-blue-600")}>
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

/** Clicks of the rows. */
function clicksOf(rows: Rows): number {
  return sumOf(rows, "clicks");
}

/** Spend of the rows. */
function spendOf(rows: Rows): number {
  return sumOf(rows, "spend");
}

/** Leads of the rows. */
function leadsOf(rows: Rows): number {
  return sumOf(rows, "leads");
}

/** Spend per click of the rows. */
function costPerClick(rows: Rows): number {
  return ratio(spendOf(rows), clicksOf(rows));
}

/** New followers of the rows; null when none of them measured it. */
function newFollowersOf(rows: Rows): number | null {
  return sumFacebookFollowers(rows).newFollowers;
}

/** One number summed over the rows. */
function sumOf(
  rows: Rows,
  key: "impressions" | "clicks" | "spend" | "leads",
): number {
  return rows.reduce((total, row) => total + row[key], 0);
}
