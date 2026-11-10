import { previousCellsFor } from "@/components/reports/PreviousPeriod/previousCells";
import { formatReportNumber, ratio, resultCellClass } from "@/lib/reportNumber";
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
  const prev = previousCellsFor(m, previous);
  /** An amount in the report's currency. */
  function money(value: number, digits = 0) {
    return `${currency}${formatReportNumber(value, digits)}`;
  }
  const cost = (
    <>
      <td className="p-2 text-center">{money(m.cost)}</td>
      {prev((data) => data.cost, money, "neutral")}
    </>
  );
  if (goal === "traffic") {
    return (
      <>
        <td className="p-2 text-center">{formatReportNumber(m.impressions)}</td>
        <td className="p-2 text-center">{formatReportNumber(m.clicks)}</td>
        {prev((data) => data.clicks, formatReportNumber, "higher")}
        {cost}
        <td className={resultCellClass("text-blue-600", isTotal)}>
          {money(costPerClick(m), 2)}
        </td>
        {prev(costPerClick, (value) => money(value, 2), "lower")}
      </>
    );
  }
  return (
    <>
      <td className="p-2 text-center">{formatReportNumber(m.impressions)}</td>
      <td className="p-2 text-center">{formatReportNumber(m.clicks)}</td>
      <td className={resultCellClass("text-green-600", isTotal)}>
        {formatReportNumber(Math.round(m.conversions))}
      </td>
      {prev(
        (data) => data.conversions,
        (value) => formatReportNumber(Math.round(value)),
        "higher",
      )}
      {cost}
      {goal === "ecommerce" ? (
        <>
          <td className={resultCellClass("text-purple-600", isTotal)}>
            {money(m.conversions_value)}
          </td>
          {prev((data) => data.conversions_value, money, "higher")}
          <td className={resultCellClass("text-blue-600", isTotal)}>
            {formatReportNumber(roas(m), 2)}x
          </td>
          {prev(roas, (value) => `${formatReportNumber(value, 2)}x`, "higher")}
        </>
      ) : (
        <>
          <td className={resultCellClass("text-blue-600", isTotal)}>
            {money(costPerLead(m), 1)}
          </td>
          {prev(costPerLead, (value) => money(value, 1), "lower")}
        </>
      )}
    </>
  );
}

/** Cost per click. */
function costPerClick(m: GoogleGoalMetrics): number {
  return ratio(m.cost, m.clicks);
}

/** Conversion value per unit of cost. */
function roas(m: GoogleGoalMetrics): number {
  return ratio(m.conversions_value, m.cost);
}

/** Cost per conversion (lead). */
function costPerLead(m: GoogleGoalMetrics): number {
  return ratio(m.cost, m.conversions);
}
