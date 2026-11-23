import { ReportKpiCard } from "../ReportKpiCard";
import type { ReportFigures } from "../metrics/reportFigures";
import { isMetricAvailable } from "../metrics/reportMetrics";
import {
  readReportMetric,
  reportMetricDelta,
  type ReportMoney,
} from "../metrics/reportMoney";
import type { ReportMetricKey } from "../metrics/reportMetricTypes";

interface MetricKpiGridProps {
  metrics: Array<ReportMetricKey>;
  current: ReportFigures;
  previous: ReportFigures | null;
  money: ReportMoney;
}

/**
 * A row of KPI cards, one per metric key: the goal blocks (sales, leads,
 * traffic) and the delivery row are this grid with their own keys. A metric
 * whose source the scope lacks is left out; one it cannot measure shows a
 * dash with the reason.
 */
export function MetricKpiGrid({
  metrics,
  current,
  previous,
  money,
}: MetricKpiGridProps) {
  const shown = metrics.filter((key) => isMetricAvailable(key, current));
  return (
    <div className="grid auto-rows-fr grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {shown.map((key) => {
        const reading = readReportMetric(key, current, money);
        return (
          <ReportKpiCard
            key={key}
            icon={reading.metric.icon}
            label={reading.metric.label}
            value={reading.text}
            delta={reportMetricDelta(key, current, previous, money)}
            hint={reading.hint ?? undefined}
          />
        );
      })}
    </div>
  );
}
