import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import { costPerPurchase } from "@/lib/dashboardCombinedFigures";
import { ratio } from "@/lib/reportNumber";
import type { FacebookColumn } from "./FacebookGoalTable";
import type { FacebookTabFormatters } from "./facebookColumns";
import { facebookTabTotals } from "./facebookTabFigures";

type Compare = NonNullable<FacebookColumn["compare"]>;

/**
 * How the Facebook tab's main columns read against the previous period: the
 * same figures the report page compares, each with the way that is good news.
 */
export function facebookCompare({
  formatCurrency,
  formatNumber,
  formatUnitCost,
}: FacebookTabFormatters) {
  return {
    spend: compare((t) => t.spend, formatCurrency, "neutral"),
    clicks: compare((t) => t.clicks, formatNumber, "higher"),
    purchases: compare((t) => t.purchases, formatNumber, "higher"),
    purchaseValue: compare((t) => t.purchase_value, formatCurrency, "higher"),
    costPerPurchase: compare(costPerPurchase, formatCurrency, "lower"),
    leads: compare((t) => t.leads, formatNumber, "higher"),
    costPerLead: compare(
      (t) => positiveOrNull(ratio(t.spend, t.leads)),
      formatCurrency,
      "lower",
    ),
    ctr: compare(
      (t) => ratio(t.clicks, t.impressions) * 100,
      (value) => `${value.toFixed(2)}%`,
      "higher",
    ),
    costPerClick: compare(
      (t) => positiveOrNull(ratio(t.spend, t.clicks)),
      formatUnitCost,
      "lower",
    ),
  } satisfies Record<string, Compare>;
}

type Totals = ReturnType<typeof facebookTabTotals>;

/** A comparison that reads one figure from the campaigns' totals. */
function compare(
  read: (totals: Totals) => number | null,
  format: (value: number) => string,
  direction: Compare["direction"],
): Compare {
  return {
    metric: (rows: Array<FacebookCampaignRow>) => read(facebookTabTotals(rows)),
    format,
    direction,
  };
}

/** A cost, or null where nothing was bought and so there is no cost. */
function positiveOrNull(value: number): number | null {
  return value > 0 ? value : null;
}
