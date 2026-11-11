import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const VALUE_TONE = {
  plain: "text-foreground",
  danger: "text-destructive",
  success: "text-brand-accent-700 dark:text-brand-accent-400",
} as const;

/**
 * A figure as a small pill inside a toolbar: icon, value and a short label.
 * The longer explanation goes in `title`, shown on hover.
 */
export function StatChip({
  icon: Icon,
  value,
  label,
  title,
  tone = "plain",
}: {
  icon: LucideIcon;
  value: ReactNode;
  label: string;
  title?: string;
  tone?: keyof typeof VALUE_TONE;
}) {
  return (
    <span
      title={title}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface-inset px-2.5 text-xs text-muted-foreground"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className={cn("font-bold tabular-nums", VALUE_TONE[tone])}>
        {value}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}
