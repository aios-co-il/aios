import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A change against the previous period, as a fraction (0.14 = +14%). */
export interface KpiDelta {
  value: number;
  /**
   * Which direction is good: more leads is good, a higher lead cost is not.
   * "either" for figures like spend, where a change is neither.
   */
  goodWhen: "up" | "down" | "either";
}

interface ReportKpiCardProps {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  delta?: KpiDelta;
  /** A small line under the value, e.g. where the figure comes from. */
  hint?: ReactNode;
}

/** One headline figure of a report: icon and label, the value, and its trend. */
export function ReportKpiCard({
  label,
  icon: Icon,
  value,
  delta,
  hint,
}: ReportKpiCardProps) {
  return (
    <div className="flex h-full flex-col gap-1 rounded-2xl border bg-card p-4 text-card-foreground shadow-elevation-1">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <div className="text-center text-2xl font-bold tabular-nums md:text-3xl">
        {value}
      </div>
      {delta && <KpiTrend delta={delta} />}
      {hint && (
        <div className="text-center text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

/**
 * ▲ +14% in the accent when the change is good, in red when it is not, and
 * muted when the direction is neither.
 */
function KpiTrend({ delta }: { delta: KpiDelta }) {
  const up = delta.value >= 0;
  const good = up === (delta.goodWhen === "up");
  const tone =
    delta.goodWhen === "either"
      ? "text-muted-foreground"
      : good
        ? "text-brand-accent-700 dark:text-brand-accent-400"
        : "text-destructive";
  const percent = `${up ? "+" : "−"}${Math.round(Math.abs(delta.value) * 100)}%`;
  return (
    <div
      dir="ltr"
      className={cn(
        "flex items-center justify-center gap-1 text-sm font-semibold tabular-nums",
        tone,
      )}
    >
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {percent}
    </div>
  );
}
