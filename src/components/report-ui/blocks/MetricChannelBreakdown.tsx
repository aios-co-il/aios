import { PieChart } from "lucide-react";
import type { CurrencyCode } from "@/lib/currency";
import { ChannelShareCard } from "../ChannelShareCard";
import type { ReportScopeData } from "../data/reportData";
import {
  formatMetricValue,
  readMetric,
  REPORT_METRICS,
} from "../metrics/reportMetrics";
import type { ReportMetricKey } from "../metrics/reportMetricTypes";
import { REPORT_CHANNEL_LABELS } from "./reportChannels";

interface MetricChannelBreakdownProps {
  scope: ReportScopeData;
  metric: ReportMetricKey;
  detail?: ReportMetricKey;
  currency: CurrencyCode;
}

/**
 * One metric split by channel, with an optional second metric beside each
 * bar (revenue with ROAS, leads with cost per lead). Each channel counts its
 * own campaigns, so its revenue is what the platform reports.
 */
export function MetricChannelBreakdown({
  scope,
  metric,
  detail,
  currency,
}: MetricChannelBreakdownProps) {
  const main = REPORT_METRICS[metric];
  if (scope.channels.length === 0) {
    return null;
  }
  const title = detail
    ? `${main.label} ו${REPORT_METRICS[detail].label} לפי ערוץ`
    : `${main.label} לפי ערוץ`;
  return (
    <ChannelShareCard
      title={title}
      icon={PieChart}
      format={(value) => formatMetricValue(main.format, value, currency)}
      channels={scope.channels.map(({ channel, figures }) => ({
        key: channel,
        label: REPORT_CHANNEL_LABELS[channel].name,
        mark: REPORT_CHANNEL_LABELS[channel].mark,
        value: main.compute(figures) ?? 0,
        // The title names the detail metric; the row shows its value only.
        detail: detail ? readMetric(detail, figures, currency).text : undefined,
      }))}
    />
  );
}
