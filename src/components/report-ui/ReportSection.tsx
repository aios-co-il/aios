import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ReportSectionProps {
  title: string;
  icon?: LucideIcon;
  /** A platform logo before the title, in place of the icon. */
  mark?: ReactNode;
  /** A short line under the title, e.g. why a table has no result columns. */
  description?: ReactNode;
  /** Controls shown at the end of the title row. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A report block: a soft card with an icon and a title, as in the AIOS report design. */
export function ReportSection({
  title,
  icon: Icon,
  mark,
  description,
  actions,
  className,
  children,
}: ReportSectionProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-card p-5 text-card-foreground shadow-elevation-1",
        className,
      )}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold">
            {mark ??
              (Icon && <Icon className="h-5 w-5 text-muted-foreground" />)}
            {title}
          </h3>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}
