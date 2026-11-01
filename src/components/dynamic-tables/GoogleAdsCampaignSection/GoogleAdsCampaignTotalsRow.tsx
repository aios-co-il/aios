import { TableCell, TableRow } from "@/components/ui/table";
import type { GoogleCampaignGoal } from "../../../../supabase/functions/_shared/pulse/google-campaign-goal.ts";
import { ratio } from "@/lib/reportNumber";
import type {
  GoogleAdsFormatters,
  GoogleAdsTotals,
  GoogleStoreTotals,
} from "./types";

type Props = GoogleAdsFormatters & {
  goal: GoogleCampaignGoal;
  groupTotals: GoogleAdsTotals;
  store: GoogleStoreTotals;
};

/** Totals row of one goal's table; the sales columns use the store totals (WooCommerce when it overlays). */
export function GoogleAdsCampaignTotalsRow({
  goal,
  groupTotals,
  store,
  formatCurrency,
  formatNumber,
  formatUnitCost,
}: Props) {
  const totalCtr = ratio(groupTotals.clicks, groupTotals.impressions) * 100;
  const totalCpc = ratio(groupTotals.spend, groupTotals.clicks);
  const totalCpa = ratio(groupTotals.spend, groupTotals.conversions);
  return (
    <TableRow className="bg-muted/50 font-bold border-t-2">
      <TableCell>סה"כ</TableCell>
      <TableCell>{formatNumber(groupTotals.impressions)}</TableCell>
      <TableCell>{formatNumber(groupTotals.clicks)}</TableCell>
      <TableCell>{totalCtr.toFixed(2)}%</TableCell>
      <TableCell>{totalCpc > 0 ? formatUnitCost(totalCpc) : "-"}</TableCell>
      <TableCell>{formatCurrency(groupTotals.spend)}</TableCell>
      {goal === "ecommerce" ? (
        <>
          <TableCell className="text-green-600">
            {formatNumber(store.purchases)}
          </TableCell>
          <TableCell className="text-green-600">
            {formatCurrency(store.revenue)}
          </TableCell>
          <TableCell>
            {groupTotals.spend > 0 ? store.roas.toFixed(2) : "-"}
          </TableCell>
          <TableCell>
            {store.purchases > 0
              ? formatCurrency(store.revenue / store.purchases)
              : "-"}
          </TableCell>
        </>
      ) : (
        <>
          <TableCell className="text-green-600">
            {formatNumber(groupTotals.conversions)}
          </TableCell>
          <TableCell>{totalCpa > 0 ? formatCurrency(totalCpa) : "-"}</TableCell>
        </>
      )}
    </TableRow>
  );
}
