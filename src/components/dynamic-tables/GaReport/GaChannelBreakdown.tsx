import { Globe, Leaf, type LucideIcon, Megaphone } from "lucide-react";
import { ReportSection } from "@/components/report-ui/ReportSection";
import { cn } from "@/lib/utils";
import type { ChannelBreakdown, TrafficKind } from "./channelBreakdown";

type Props = {
  breakdown: ChannelBreakdown;
  formatNumber: (value: number) => string;
};

type Part = {
  kind: TrafficKind;
  label: string;
  icon: LucideIcon;
  tone: string;
};

const PARTS: ReadonlyArray<Part> = [
  {
    kind: "organic",
    label: "אורגני",
    icon: Leaf,
    tone: "bg-surface-status-green text-brand-accent-700 dark:text-brand-accent-400",
  },
  { kind: "paid", label: "ממומן", icon: Megaphone, tone: "bg-muted" },
  { kind: "other", label: "ישיר ואחר", icon: Globe, tone: "bg-muted" },
];

/**
 * The "אורגני מול ממומן" block: users, their share and conversions for
 * organic, paid and the rest (direct, referral, unassigned and the like), so
 * the three shares add up to 100%. Hidden when the period has no users.
 */
export function GaChannelBreakdown({ breakdown, formatNumber }: Props) {
  const totalUsers = PARTS.reduce(
    (sum, part) => sum + breakdown[part.kind].users,
    0,
  );
  if (totalUsers === 0) {
    return null;
  }
  return (
    <ReportSection
      title="אורגני מול ממומן"
      description="ממומן כולל גם Cross-network (Performance Max ו-Demand Gen) ו-Display"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PARTS.map(({ kind, label, icon: Icon, tone }) => (
          <div
            key={kind}
            className={cn("rounded-lg border p-3 text-center", tone)}
          >
            <div className="mb-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <Icon className="h-4 w-4" aria-hidden="true" />
              {`משתמשים ${label}`}
            </div>
            <p className="text-xl font-bold tabular-nums">
              {formatNumber(breakdown[kind].users)}
            </p>
            <p className="text-xs text-muted-foreground">
              {`${((breakdown[kind].users / totalUsers) * 100).toFixed(1)}%`}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {`המרות: ${formatNumber(breakdown[kind].conversions)}`}
            </p>
          </div>
        ))}
      </div>
    </ReportSection>
  );
}
