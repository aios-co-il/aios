import type { GoogleReportCampaignGoal } from "@/lib/googleCampaignGoals";
import type { GoogleGoalSplit } from "./splitGoogleGroupsByGoal";

/** The 'יעד' header, shown only when the table mixes goals. */
export function GoogleGoalHead({ mixed }: { mixed: boolean }) {
  return mixed ? <th className="p-2 text-center font-medium">יעד</th> : null;
}

/** A row's goal ('מכירות' / 'לידים'), shown only when the table mixes goals. */
export function GoogleGoalCell({
  mixed,
  goal,
}: {
  mixed: boolean;
  goal: GoogleReportCampaignGoal;
}) {
  if (!mixed) {
    return null;
  }
  return (
    <td className="p-2 text-center">
      {goal === "ecommerce" ? "מכירות" : "לידים"}
    </td>
  );
}

/** Value and ROAS headers for sales rows, cost-per-lead header for lead rows. */
export function GoogleGoalValueHeads({
  split,
  useWooOverlay,
}: {
  split: GoogleGoalSplit;
  useWooOverlay: boolean;
}) {
  return (
    <>
      {(split.isEcommerce || split.mixedGoals) && (
        <>
          <th className="p-2 text-center font-medium">
            {useWooOverlay ? "ערך (GA)" : "ערך המרות"}
          </th>
          <th className="p-2 text-center font-medium">ROAS</th>
        </>
      )}
      {!split.isEcommerce && (
        <th className="p-2 text-center font-medium">עלות לליד</th>
      )}
    </>
  );
}

/** A row's value and ROAS when it is a sales row, its cost per lead when it is a lead row; '-' otherwise. */
export function GoogleGoalValueCells({
  split,
  goal,
  currency,
  conversionsValue,
  roas,
  costPerConversion,
}: {
  split: GoogleGoalSplit;
  goal: GoogleReportCampaignGoal;
  currency: string;
  conversionsValue: number;
  roas: number;
  costPerConversion: number;
}) {
  return (
    <>
      {(split.isEcommerce || split.mixedGoals) &&
        (goal === "ecommerce" ? (
          <>
            <td className="p-2 text-center text-purple-600 font-medium">
              {currency}
              {conversionsValue.toLocaleString("he-IL", {
                maximumFractionDigits: 0,
              })}
            </td>
            <td className="p-2 text-center text-blue-600 font-medium">
              {roas.toLocaleString("he-IL", { maximumFractionDigits: 2 })}x
            </td>
          </>
        ) : (
          <>
            <td className="p-2 text-center">-</td>
            <td className="p-2 text-center">-</td>
          </>
        ))}
      {!split.isEcommerce &&
        (goal === "leads" ? (
          <td className="p-2 text-center text-blue-600 font-medium">
            {currency}
            {costPerConversion.toLocaleString("he-IL", {
              maximumFractionDigits: 1,
            })}
          </td>
        ) : (
          <td className="p-2 text-center">-</td>
        ))}
    </>
  );
}
