import { REPORT_CELL } from "@/components/report-ui/ReportTable";
import type { ChangeDirection } from "@/components/reports/PreviousPeriod/changeMark";
import {
  compareCellsFor,
  type ComparedMetric,
} from "@/components/reports/PreviousPeriod/previousCells";
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
  direction: ChangeDirection;
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
        // Null without conversions or spend, as its cell then shows "-".
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

/** A column that does not compare: no mark and no previous cell. */
const NOT_COMPARED: ComparedMetric = { mark: null, previousCell: null };

/**
 * The comparison of a row's columns, read by header: the current cell's mark
 * and the previous cell of a compared column, or nothing for a column that is
 * not compared or while the comparison is off. `previous` is null for a
 * campaign that did not run then.
 */
export function googleComparedFor(
  current: GoogleAdsTotals,
  previous: GoogleAdsTotals | null | undefined,
  metrics: Partial<Record<string, GoogleComparedMetric>> | null | undefined,
) {
  const compareMetric = compareCellsFor(current, previous, REPORT_CELL);
  return function compared(label: string): ComparedMetric {
    const metric = metrics?.[label];
    return metric
      ? compareMetric(metric.metric, metric.format, metric.direction)
      : NOT_COMPARED;
  };
}
