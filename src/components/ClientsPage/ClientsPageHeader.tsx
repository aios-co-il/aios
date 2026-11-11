import type { ReactNode } from "react";
import { Users } from "lucide-react";

/** The screen title with the shown-client count, and the page actions at the end. */
export function ClientsPageHeader({
  shownCount,
  children,
}: {
  /** Undefined while the list is loading. */
  shownCount: number | undefined;
  children: ReactNode;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-ink text-brand-accent shadow-elevation-1 dark:bg-brand-accent-900/50">
          <Users className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-2xl font-bold leading-tight">לקוחות</h2>
          <p className="text-sm text-muted-foreground">
            {shownCount === undefined
              ? "ניהול לקוחות"
              : `ניהול לקוחות · ${shownCount} מוצגים`}
          </p>
        </div>
      </div>
      <div className="ms-auto flex items-center gap-2">{children}</div>
    </header>
  );
}
