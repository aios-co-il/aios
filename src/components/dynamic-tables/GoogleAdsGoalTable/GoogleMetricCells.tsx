import { MarkedCell } from "@/components/reports/PreviousPeriod/MarkedCell";
import { compareCellsFor } from "@/components/reports/PreviousPeriod/previousCells";
import { formatReportNumber, resultCellClass } from "@/lib/reportNumber";
import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";
import type { GoogleGoalMetrics } from "./googleGoalMetrics";

type Props = {
  m: GoogleGoalMetrics;
  /** Null when the entity did not run then; undefined with comparison off. */
  previous: GoogleGoalMetrics | null | undefined;
  goal: GoogleReportGoal;
  currency: string;
  isTotal: boolean;
};

/** Metric cells of a row or of the total row; each goal has its own result columns. */
export function GoogleMetricCells({
  m,
  previous,
  goal,
  currency,
  isTotal,
}: Props) {
  const compared = compareCellsFor(m, previous);
  /** An amount in the report's currency. */
  function money(value: number, digits = 0) {
    return `${currency}${formatReportNumber(value, digits)}`;
  }
  const cost = compared((data) => data.cost, money, "neutral");
  const costCells = (
    <>
      <MarkedCell className="p-2 text-center" mark={cost.mark}>
        {money(m.cost)}
      </MarkedCell>
      {cost.previousCell}
    </>
  );
  if (goal === "traffic") {
    const clicks = compared(
      (data) => data.clicks,
      formatReportNumber,
      "higher",
    );
    const perClick = compared(
      costPerClick,
      (value) => money(value, 2),
      "lower",
    );
    return (
      <>
        <td className="p-2 text-center">{formatReportNumber(m.impressions)}</td>
        <MarkedCell className="p-2 text-center" mark={clicks.mark}>
          {formatReportNumber(m.clicks)}
        </MarkedCell>
        {clicks.previousCell}
        {costCells}
        <MarkedCell
          className={resultCellClass("text-blue-600", isTotal)}
          mark={perClick.mark}
        >
          {money(costPerClick(m) ?? 0, 2)}
        </MarkedCell>
        {perClick.previousCell}
      </>
    );
  }
  const conversions = compared(
    (data) => data.conversions,
    (value) => formatReportNumber(Math.round(value)),
    "higher",
  );
  const value = compared((data) => data.conversions_value, money, "higher");
  const returnOnSpend = compared(
    roas,
    (ratio) => `${formatReportNumber(ratio, 2)}x`,
    "higher",
  );
  const perLead = compared(costPerLead, (cpl) => money(cpl, 1), "lower");
  return (
    <>
      <td className="p-2 text-center">{formatReportNumber(m.impressions)}</td>
      <td className="p-2 text-center">{formatReportNumber(m.clicks)}</td>
      <MarkedCell
        className={resultCellClass("text-green-600", isTotal)}
        mark={conversions.mark}
      >
        {formatReportNumber(Math.round(m.conversions))}
      </MarkedCell>
      {conversions.previousCell}
      {costCells}
      {goal === "ecommerce" ? (
        <>
          <MarkedCell
            className={resultCellClass("text-purple-600", isTotal)}
            mark={value.mark}
          >
            {money(m.conversions_value)}
          </MarkedCell>
          {value.previousCell}
          <MarkedCell
            className={resultCellClass("text-blue-600", isTotal)}
            mark={returnOnSpend.mark}
          >
            {formatReportNumber(roas(m) ?? 0, 2)}x
          </MarkedCell>
          {returnOnSpend.previousCell}
        </>
      ) : (
        <>
          <MarkedCell
            className={resultCellClass("text-blue-600", isTotal)}
            mark={perLead.mark}
          >
            {money(costPerLead(m) ?? 0, 1)}
          </MarkedCell>
          {perLead.previousCell}
        </>
      )}
    </>
  );
}

/** Cost per click; null without clicks, so it is not compared. */
function costPerClick(m: GoogleGoalMetrics): number | null {
  return m.clicks > 0 ? m.cost / m.clicks : null;
}

/** Conversion value per unit of cost; null without spend, so it is not compared. */
function roas(m: GoogleGoalMetrics): number | null {
  return m.cost > 0 ? m.conversions_value / m.cost : null;
}

/** Cost per conversion (lead); null without conversions, so it is not compared. */
function costPerLead(m: GoogleGoalMetrics): number | null {
  return m.conversions > 0 ? m.cost / m.conversions : null;
}
