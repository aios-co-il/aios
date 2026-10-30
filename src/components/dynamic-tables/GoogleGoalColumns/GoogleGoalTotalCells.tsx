import type { GoogleGoalSplit } from "./splitGoogleGroupsByGoal";

type Props = {
  split: GoogleGoalSplit;
  useWooOverlay: boolean;
  currency: string;
  /** Revenue of the whole table: WooCommerce's when it overlays, else Google's. */
  displayRevenue: number;
  /** ROAS of the whole table, used when it does not mix goals. */
  totalRoas: number;
};

/** Totals for the value, ROAS and cost-per-lead columns; a mixed table takes each from its own goal's rows. */
export function GoogleGoalTotalCells({
  split,
  useWooOverlay,
  currency,
  displayRevenue,
  totalRoas,
}: Props) {
  const { mixedGoals, isEcommerce, ecommerceTotals, leadTotals } = split;
  const revenue =
    mixedGoals && !useWooOverlay
      ? ecommerceTotals.conversions_value
      : displayRevenue;
  const roas = mixedGoals
    ? ecommerceTotals.cost > 0
      ? (useWooOverlay ? displayRevenue : ecommerceTotals.conversions_value) /
        ecommerceTotals.cost
      : 0
    : totalRoas;
  const costPerLead =
    leadTotals.conversions > 0 ? leadTotals.cost / leadTotals.conversions : 0;
  return (
    <>
      {(isEcommerce || mixedGoals) && (
        <>
          <td className="p-2 text-center text-purple-600">
            {currency}
            {Math.round(revenue).toLocaleString("he-IL")}
          </td>
          <td className="p-2 text-center text-blue-600">
            {roas.toLocaleString("he-IL", { maximumFractionDigits: 2 })}x
          </td>
        </>
      )}
      {!isEcommerce && (
        <td className="p-2 text-center text-blue-600">
          {currency}
          {costPerLead.toLocaleString("he-IL", { maximumFractionDigits: 1 })}
        </td>
      )}
    </>
  );
}
