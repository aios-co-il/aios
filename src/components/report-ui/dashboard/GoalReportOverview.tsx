import { useMemo } from "react";
import type { CurrencyCode } from "@/lib/currency";
import {
  buildReportPeriod,
  type ReportPeriodInput,
} from "../data/buildReportPeriod";
import { reportDataOf } from "../data/reportData";
import { defaultReportLayout } from "../layout/reportLayout";
import { ReportLayoutView } from "../layout/ReportLayoutView";

interface GoalReportOverviewProps {
  current: ReportPeriodInput;
  /** The period of equal length before; null shows the report without changes. */
  previous: ReportPeriodInput | null;
  currency: CurrencyCode;
  /** Offer "בקש תובנה מכרמן"; left off on shared reports. */
  askCarmen?: boolean;
}

/**
 * A dashboard's overview as the per-goal report: delivery for every campaign,
 * then a block per campaign goal (sales, leads, traffic). The dashboard's
 * other blocks follow it under "פירוט נוסף", so no figure leaves the page.
 * Renders nothing when no campaign has a goal and no store is measured.
 */
export function GoalReportOverview({
  current,
  previous,
  currency,
  askCarmen = false,
}: GoalReportOverviewProps) {
  const currentPeriod = useMemo(() => buildReportPeriod(current), [current]);
  const previousPeriod = useMemo(
    () => (previous ? buildReportPeriod(previous) : null),
    [previous],
  );
  const data = useMemo(
    () =>
      reportDataOf({
        current: currentPeriod,
        previous: previousPeriod,
        currency,
        askCarmen,
      }),
    [currentPeriod, previousPeriod, currency, askCarmen],
  );
  const layout = useMemo(
    () => defaultReportLayout(currentPeriod.goals),
    [currentPeriod.goals],
  );
  if (currentPeriod.goals.length === 0) {
    return null;
  }
  return (
    <div className="space-y-6">
      <ReportLayoutView layout={layout} data={data} />
      <h3 className="border-t pt-6 text-lg font-bold">פירוט נוסף</h3>
    </div>
  );
}
