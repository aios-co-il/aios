import type { LucideIcon } from "lucide-react";
import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { REPORT_AXIS_TICK, REPORT_CHART } from "./reportChartTheme";
import { ReportSection } from "./ReportSection";

interface ReportTrendChartProps<Row> {
  title: string;
  icon?: LucideIcon;
  data: Row[];
  xKey: keyof Row & string;
  valueKey: keyof Row & string;
  valueName: string;
  format?: (value: number) => string;
  height?: number;
}

/** A figure over time: an accent line with dots over a soft accent fill. */
export function ReportTrendChart<Row>({
  title,
  icon,
  data,
  xKey,
  valueKey,
  valueName,
  format,
  height = 260,
}: ReportTrendChartProps<Row>) {
  const fillId = `report-fill-${useId().replace(/:/g, "")}`;
  return (
    <ReportSection title={title} icon={icon}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={REPORT_CHART.primary}
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor={REPORT_CHART.primary}
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={REPORT_CHART.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={REPORT_AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={REPORT_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={format}
          />
          <Tooltip
            formatter={(value: number) => (format ? format(value) : value)}
          />
          <Area
            type="monotone"
            dataKey={valueKey}
            name={valueName}
            stroke={REPORT_CHART.primary}
            strokeWidth={2.5}
            fill={`url(#${fillId})`}
            dot={{ r: 3.5, fill: REPORT_CHART.primary, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ReportSection>
  );
}
