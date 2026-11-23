import { ReportTd } from "@/components/report-ui/ReportTable";
import type {
  WeeklyAdsSource,
  WeeklyCampaignRow,
} from "@/lib/weeklyAdsComparison";
import {
  weeklyGoalTotals,
  type WeeklyGoalGroup,
  type WeeklyGoalTotals,
} from "@/lib/weeklyCampaignGoals";
import type { WeeklyGoalColumn } from "./weeklyGoalColumns";

/**
 * The total row: each column of the goal's totals, and an amount column per
 * currency side by side when the platforms' currencies differ.
 */
export function WeeklyTotalCells({
  group,
  currencyOf,
  columns,
}: {
  group: WeeklyGoalGroup;
  currencyOf: (source: WeeklyAdsSource) => string;
  columns: Array<WeeklyGoalColumn>;
}) {
  const totals = group.totals;
  const byCurrency = totalsByCurrency(group, currencyOf);
  return (
    <>
      {columns.map((column) => (
        <ReportTd key={column.label} className={column.className}>
          {column.money
            ? byCurrency
                .map((part) => column.value(part.totals, part.currency))
                .join(" · ")
            : column.value(totals, byCurrency[0]?.currency ?? "")}
        </ReportTd>
      ))}
    </>
  );
}

/**
 * The goal's totals per currency, in the order the currencies first appear;
 * the goal's own totals when its campaigns share one currency.
 */
function totalsByCurrency(
  group: WeeklyGoalGroup,
  currencyOf: (source: WeeklyAdsSource) => string,
): Array<{ currency: string; totals: WeeklyGoalTotals }> {
  const rows = new Map<string, Array<WeeklyCampaignRow>>();
  for (const row of group.rows) {
    const currency = currencyOf(row.source);
    rows.set(currency, [...(rows.get(currency) ?? []), row]);
  }
  if (rows.size <= 1) {
    return [...rows.keys()].map((currency) => ({
      currency,
      totals: group.totals,
    }));
  }
  return [...rows].map(([currency, own]) => ({
    currency,
    totals: weeklyGoalTotals(own),
  }));
}
