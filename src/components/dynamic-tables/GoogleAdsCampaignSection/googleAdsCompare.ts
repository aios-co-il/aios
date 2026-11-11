import { REPORT_CELL } from "@/components/report-ui/ReportTable";
import { previousCellsFor } from "@/components/reports/PreviousPeriod/previousCells";
import type { PreviousValueProps } from "@/components/reports/PreviousPeriod/PreviousValueCell";
import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";
import { ratio } from "@/lib/reportNumber";
import type {
  GoogleAdsCampaignSummaryRow,
  GoogleAdsFormatters,
  GoogleAdsTotals,
} from "./types";

/** How one column reads against the previous period. */
export type GoogleComparedMetric = {
  metric: (totals: GoogleAdsTotals) => number | null;
  format: (value: number) => string;
  direction: PreviousValueProps["direction"];
};

/** One table's previous period: each campaign's row, and the table's total. */
export type GoogleAdsTablePrevious = {
  byKey: Map<string, GoogleAdsCampaignSummaryRow>;
  totals: GoogleAdsTotals;
};

/**
 * The columns of a goal's table that compare with the previous period, by
 * their header: clicks and spend, then the goal's results.
 */
export function googleComparedMetrics(
  goal: GoogleReportGoal,
  { formatCurrency, formatNumber }: GoogleAdsFormatters,
): Partial<Record<string, GoogleComparedMetric>> {
  const delivery = {
    קליקים: {
      metric: (t) => t.clicks,
      format: formatNumber,
      direction: "higher",
    },
    הוצאה: {
      metric: (t) => t.spend,
      format: formatCurrency,
      direction: "neutral",
    },
  } satisfies Record<string, GoogleComparedMetric>;
  if (goal === "ecommerce") {
    return {
      ...delivery,
      רכישות: {
        metric: (t) => t.conversions,
        format: formatNumber,
        direction: "higher",
      },
      הכנסות: {
        metric: (t) => t.conversions_value,
        format: formatCurrency,
        direction: "higher",
      },
    };
  }
  if (goal === "leads") {
    return {
      ...delivery,
      המרות: {
        metric: (t) => t.conversions,
        format: formatNumber,
        direction: "higher",
      },
      "עלות להמרה": {
        metric: (t) => {
          const cost = ratio(t.spend, t.conversions);
          return cost > 0 ? cost : null;
        },
        format: formatCurrency,
        direction: "lower",
      },
    };
  }
  return delivery;
}

/** The key a campaign is matched by across periods. */
export function googleCampaignKey(row: GoogleAdsCampaignSummaryRow): string {
  return row.campaign_id || row.name;
}

/** A goal table's previous period from the previous summary's campaigns. */
export function googleTablePrevious(
  campaigns: Array<GoogleAdsCampaignSummaryRow>,
  totals: GoogleAdsTotals,
): GoogleAdsTablePrevious {
  return {
    byKey: new Map(campaigns.map((row) => [googleCampaignKey(row), row])),
    totals,
  };
}

/**
 * The previous-period cell of a column, or nothing when the column is not
 * compared or the comparison is off. `previous` is null for a campaign that
 * did not run then.
 */
export function googlePreviousCell(
  current: GoogleAdsTotals,
  previous: GoogleAdsTotals | null | undefined,
  compared: Partial<Record<string, GoogleComparedMetric>> | null | undefined,
) {
  const cell = previousCellsFor(current, previous, REPORT_CELL);
  return function previousOf(label: string) {
    const metric = compared?.[label];
    return metric ? cell(metric.metric, metric.format, metric.direction) : null;
  };
}
