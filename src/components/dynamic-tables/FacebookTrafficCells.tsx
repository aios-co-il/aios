import { MarkedCell } from "@/components/reports/PreviousPeriod/MarkedCell";
import { compareCellsFor } from "@/components/reports/PreviousPeriod/previousCells";
import {
  costPerFollower,
  formatFollowerCell,
  sumFacebookFollowers,
} from "@/lib/facebookFollowers";
import { formatReportNumber, ratio, resultCellClass } from "@/lib/reportNumber";
import { leadsOf, perUnit, spendOf, sumOf, summed } from "./facebookMetrics";
import type { FacebookReportCampaign } from "./facebookReportCampaigns";

type Rows = Array<FacebookReportCampaign>;

const clicksOf = summed("clicks");
const costPerClick = perUnit("spend", "clicks");

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
  const compared = compareCellsFor(campaigns, previous);
  const clicks = compared(clicksOf, formatReportNumber, "higher");
  const spend = compared(spendOf, money, "neutral");
  const cpc = compared(costPerClick, moneyCents, "lower");
  const leads = compared(leadsOf, formatReportNumber, "higher");
  const followers = compared(newFollowersOf, formatReportNumber, "higher");
  const green = resultCellClass("text-green-600", isTotal);
  const blue = resultCellClass("text-blue-600", isTotal);
  /** An amount in the report's currency. */
  function money(value: number) {
    return `${currency}${formatReportNumber(value)}`;
  }
  /** A small amount in the report's currency, to the agora. */
  function moneyCents(value: number) {
    return `${currency}${formatReportNumber(value, 2)}`;
  }
  return (
    <>
      <td className="p-2 text-center">{formatReportNumber(impressions)}</td>
      <MarkedCell className={green} mark={clicks.mark}>
        {formatReportNumber(clicksOf(campaigns))}
      </MarkedCell>
      {clicks.previousCell}
      <MarkedCell className="p-2 text-center" mark={spend.mark}>
        {money(spendOf(campaigns))}
      </MarkedCell>
      {spend.previousCell}
      <td className="p-2 text-center">
        {formatReportNumber(ratio(clicksOf(campaigns), impressions) * 100, 2)}%
      </td>
      <MarkedCell className={blue} mark={cpc.mark}>
        {moneyCents(costPerClick(campaigns) ?? 0)}
      </MarkedCell>
      {cpc.previousCell}
      {withLeads && (
        <>
          <MarkedCell className="p-2 text-center" mark={leads.mark}>
            {formatReportNumber(leadsOf(campaigns))}
          </MarkedCell>
          {leads.previousCell}
        </>
      )}
      {withFollowers && (
        <>
          <MarkedCell className={green} mark={followers.mark}>
            {formatFollowerCell(newFollowersOf(campaigns), formatReportNumber)}
          </MarkedCell>
          {followers.previousCell}
          <td className={blue}>
            {formatFollowerCell(costPerFollower(campaigns), moneyCents)}
          </td>
        </>
      )}
    </>
  );
}

/** New followers of the rows; null when none of them measured it. */
function newFollowersOf(rows: Rows): number | null {
  return sumFacebookFollowers(rows).newFollowers;
}
