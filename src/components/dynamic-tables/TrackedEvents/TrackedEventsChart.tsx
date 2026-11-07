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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

/** Each followed event's daily count, one line per event. */
export function TrackedEventsChart({ events, days }: Props) {
  if (days.length < 2) {
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>אירועים לפי יום</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={days}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" fontSize={12} />
            <YAxis fontSize={12} />
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
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
