import { AlertCircle } from "lucide-react";
import { MAX_CUSTOM_RANGE_DAYS } from "../../../../supabase/functions/_shared/share-links/request-range.ts";

/**
 * Said under a share link's header when its endpoint refused the picked
 * window. It marks the page with data-snapshot-error, so a send capture stops
 * instead of photographing a report without figures.
 */
export function RangeRefusedNotice() {
  return (
    <div
      role="alert"
      data-snapshot-error="range_refused"
      className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
    >
      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
      <span>
        לא ניתן להציג את הטווח שנבחר. בחרו טווח של עד {MAX_CUSTOM_RANGE_DAYS}{" "}
        ימים.
      </span>
    </div>
  );
}
