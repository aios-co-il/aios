import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ReportSection } from "./ReportSection";

export interface ChannelShare {
  key: string;
  label: string;
  /** The channel's mark, e.g. the Meta or Google logo. */
  mark: ReactNode;
  /** Null when the channel cannot measure the figure: a dash, no bar. */
  value: number | null;
  /** A second figure under the value, e.g. the channel's cost per lead. */
  detail?: ReactNode;
  /** The channel's own formatter, e.g. in its currency; else the card's. */
  format?: (value: number) => string;
}

interface ChannelShareCardProps {
  title: string;
  icon?: LucideIcon;
  channels: Array<ChannelShare>;
  format?: (value: number) => string;
  /**
   * Values that cannot be compared, such as amounts in different currencies:
   * no bars, each value on its own.
   */
  separate?: boolean;
}

/** One figure split by channel: a bar per channel, the largest in the accent. */
export function ChannelShareCard({
  title,
  icon,
  channels,
  format,
  separate = false,
}: ChannelShareCardProps) {
  const sorted = [...channels].sort(
    (a, b) => (b.value ?? -1) - (a.value ?? -1),
  );
  const max = Math.max(...sorted.map((channel) => channel.value ?? 0), 1);
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
            {separate ? (
              <span className="flex-1" />
            ) : (
              <span className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    index === 0
                      ? "bg-gradient-to-l from-brand-accent to-brand-accent/60"
                      : "bg-brand-neutral",
                  )}
                  style={{ width: `${((channel.value ?? 0) / max) * 100}%` }}
                />
              </span>
            )}
            <span className="w-20 shrink-0 text-end tabular-nums">
              <span className="block text-sm font-semibold">
                {channel.value === null
                  ? "—"
                  : (channel.format ?? format ?? String)(channel.value)}
              </span>
              {channel.detail && (
                <span className="block text-xs text-muted-foreground">
                  {channel.detail}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </ReportSection>
  );
}
