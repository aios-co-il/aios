import { PieChart } from "lucide-react";
import type { DashboardCurrencies } from "@/lib/dashboardCurrencies";
import { ChannelShareCard } from "../ChannelShareCard";
import type { ReportScopeData } from "../data/reportData";
import { formatMetricValue, REPORT_METRICS } from "../metrics/reportMetrics";
import {
  channelMoney,
  isSplitMetric,
  readReportMetric,
  reportMoneyOf,
} from "../metrics/reportMoney";
import type { ReportMetricKey } from "../metrics/reportMetricTypes";
import { REPORT_CHANNEL_LABELS } from "./reportChannels";

interface MetricChannelBreakdownProps {
  scope: ReportScopeData;
  metric: ReportMetricKey;
  detail?: ReportMetricKey;
  currencies: DashboardCurrencies;
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
  currencies,
}: MetricChannelBreakdownProps) {
  const main = REPORT_METRICS[metric];
  if (scope.channels.length === 0) {
    return null;
  }
  // Bars of different currencies cannot share one scale or one share of a
  // total, so each channel then shows its own amount without a bar.
  const split = isSplitMetric(
    metric,
    scope.figures,
    reportMoneyOf(scope.channels, currencies),
  );
  const title = detail
    ? `${main.label} ו${REPORT_METRICS[detail].label} לפי ערוץ`
    : `${main.label} לפי ערוץ`;
  return (
    <ChannelShareCard
      title={title}
      icon={PieChart}
      channels={scope.channels.map(({ channel, figures }) => {
        const money = channelMoney(channel, currencies);
        return {
          key: channel,
          label: REPORT_CHANNEL_LABELS[channel].name,
          mark: REPORT_CHANNEL_LABELS[channel].mark,
          value: main.compute(figures),
          format: (value: number) =>
            formatMetricValue(main.format, value, money.ads),
          // The title names the detail metric; the row shows its value only.
          detail: detail
            ? readReportMetric(detail, figures, money).text
            : undefined,
        };
      })}
      separate={split}
    />
  );
}
