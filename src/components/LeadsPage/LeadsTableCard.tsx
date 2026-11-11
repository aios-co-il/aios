import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface LeadsTableCardProps {
  title: string;
  icon: LucideIcon;
  count: number;
  /** Controls at the end of the header, e.g. pagination. */
  actions?: ReactNode;
  /** Set both to let the header fold the table away. */
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}

/**
 * A report-style card around a leads table: icon, title and count in the
 * header, the table filling the rest. Folds when given `onToggle`.
 */
export function LeadsTableCard({
  title,
  icon,
  count,
  actions,
  isOpen = true,
  onToggle,
  children,
}: LeadsTableCardProps) {
  const foldable = !!onToggle;
  const header = (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 px-4 py-2.5",
        foldable && "cursor-pointer transition-colors hover:bg-muted/50",
      )}
    >
      <HeaderContent
        title={title}
        icon={icon}
        count={count}
        actions={actions}
        foldable={foldable}
        isOpen={isOpen}
      />
    </div>
  );
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onToggle}
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-elevation-1",
        isOpen ? "min-h-0 flex-1" : "shrink-0",
      )}
    >
      {foldable ? (
        <CollapsibleTrigger asChild>{header}</CollapsibleTrigger>
      ) : (
        header
      )}
      {isOpen && (
        <div className="min-h-0 flex-1 overflow-hidden border-t">
          {children}
        </div>
      )}
    </Collapsible>
  );
}

/** The title, count and header controls of the card. */
function HeaderContent({
  title,
  icon: Icon,
  count,
  actions,
  foldable,
  isOpen,
}: Omit<LeadsTableCardProps, "children" | "onToggle"> & {
  foldable: boolean;
}) {
  return (
    <>
      <h3 className="flex min-w-0 items-center gap-2 text-sm font-bold">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{title}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {count.toLocaleString()}
        </span>
      </h3>
      <div className="flex items-center gap-2">
        {actions}
        {foldable && (
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              !isOpen && "rotate-90",
            )}
          />
        )}
      </div>
    </>
  );
}
