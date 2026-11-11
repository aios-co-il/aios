import { Users } from "lucide-react";

/** The screen title with the shown-client count, at the start of the toolbar. */
export function ClientsTitle({
  shownCount,
}: {
  /** Undefined while the list is loading. */
  shownCount: number | undefined;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 pe-1">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-ink text-brand-accent dark:bg-brand-accent-900/50">
        <Users className="h-4 w-4" aria-hidden="true" />
      </span>
      <h2 className="text-base font-bold leading-none">לקוחות</h2>
      {shownCount !== undefined && (
        <span className="text-xs text-muted-foreground">
          {shownCount} מוצגים
        </span>
      )}
    </div>
  );
}
