import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import { ReportSection } from "@/components/report-ui/ReportSection";
import {
  REPORT_AXIS_TICK,
  REPORT_CHART,
} from "@/components/report-ui/reportChartTheme";
import type { TrackedEvent, TrackedEventsDay } from "./trackedEvents";

type Props = {
  events: Array<TrackedEvent>;
  days: Array<TrackedEventsDay>;
};

/** Distinct line colours, repeated past eight events. */
const LINE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#9333ea",
  "#dc2626",
  "#0891b2",
  "#ca8a04",
  "#db2777",
];

/** Each followed event's daily count, one line per event; a single day shows as dots. */
export function TrackedEventsChart({ events, days }: Props) {
  if (days.length === 0) {
    return null;
  }
  return (
    <ReportSection title="יעדים לפי יום" icon={LineChartIcon}>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={days}>
          <CartesianGrid strokeDasharray="3 3" stroke={REPORT_CHART.grid} />
          <XAxis dataKey="date" tick={REPORT_AXIS_TICK} />
          <YAxis tick={REPORT_AXIS_TICK} />
          <Tooltip />
          <Legend />
          {events.map((item, index) => (
            <Line
              key={item.event}
              type="monotone"
              dataKey={item.event}
              name={item.label}
              stroke={LINE_COLORS[index % LINE_COLORS.length]}
              strokeWidth={2}
              dot={days.length === 1}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ReportSection>
  );
}
