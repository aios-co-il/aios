import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ReportSection } from "./ReportSection";

export interface ChannelShare {
  key: string;
  label: string;
  /** The channel's mark, e.g. the Meta or Google logo. */
  mark: ReactNode;
  value: number;
}

interface ChannelShareCardProps {
  title: string;
  icon?: LucideIcon;
  channels: Array<ChannelShare>;
  format: (value: number) => string;
}

/** One figure split by channel: a bar per channel, the largest in the accent. */
export function ChannelShareCard({
  title,
  icon,
  channels,
  format,
}: ChannelShareCardProps) {
  const sorted = [...channels].sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((channel) => channel.value), 1);
  return (
    <ReportSection title={title} icon={icon}>
      <ul className="space-y-4">
        {sorted.map((channel, index) => (
          <li key={channel.key} className="flex items-center gap-3">
            <span className="flex w-28 shrink-0 items-center gap-2 text-sm font-medium">
              <span className="flex h-5 w-5 items-center justify-center">
                {channel.mark}
              </span>
              {channel.label}
            </span>
            <span className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  "block h-full rounded-full",
                  index === 0
                    ? "bg-gradient-to-l from-brand-accent to-brand-accent/60"
                    : "bg-brand-neutral",
                )}
                style={{ width: `${(channel.value / max) * 100}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-end text-sm font-semibold tabular-nums">
              {format(channel.value)}
            </span>
          </li>
        ))}
      </ul>
    </ReportSection>
  );
}
