import type { LucideIcon } from "lucide-react";
import { AlarmClock, CalendarClock, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadsSummary } from "./leadsSummary";

type TileTone = "accent" | "neutral" | "warning" | "danger";

const TONE_CLASS: Record<TileTone, string> = {
  accent:
    "bg-brand-accent-100 text-brand-accent-800 dark:bg-brand-accent-900 dark:text-brand-accent-100",
  neutral: "bg-muted text-foreground",
  warning: "bg-surface-status-yellow text-foreground",
  danger: "bg-surface-status-red text-destructive",
};

interface LeadsSummaryStripProps {
  shownCount: number;
  totalCount: number;
  summary: LeadsSummary;
  /** The counts cover one page of a longer list. */
  isPaged: boolean;
}

/** Headline counts for the leads on screen, in the report KPI style. */
export function LeadsSummaryStrip({
  shownCount,
  totalCount,
  summary,
  isPaged,
}: LeadsSummaryStripProps) {
  const scope = isPaged ? "בעמוד הנוכחי" : undefined;
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <SummaryTile
        icon={Users}
        tone="accent"
        label="לידים בתצוגה"
        value={shownCount}
        hint={isPaged ? `מתוך ${totalCount.toLocaleString()}` : undefined}
      />
      <SummaryTile
        icon={Sparkles}
        tone="neutral"
        label="נכנסו היום"
        value={summary.createdToday}
        hint={scope}
      />
      <SummaryTile
        icon={CalendarClock}
        tone="warning"
        label="חזרה היום"
        value={summary.followUpToday}
        hint={scope}
      />
      <SummaryTile
        icon={AlarmClock}
        tone="danger"
        label="חזרה באיחור"
        value={summary.followUpOverdue}
        hint={scope}
      />
    </div>
  );
}

/** One compact figure: a tinted icon, the value and its label. */
function SummaryTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  tone: TileTone;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-2.5 text-card-foreground shadow-elevation-1">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          TONE_CLASS[tone],
        )}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold leading-none tabular-nums">
            {value.toLocaleString()}
          </span>
          {hint && (
            <span className="truncate text-[11px] text-muted-foreground">
              {hint}
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
