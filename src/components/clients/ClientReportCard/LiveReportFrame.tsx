import { Suspense, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { FitToWidth } from "./FitToWidth";

type Props = {
  /** The share token is ready; until then the card shows a loader. */
  ready: boolean;
  /** Reading or making the share link failed. */
  failed: boolean;
  /** Drawn while a sync or a send runs over the live report. */
  busyLabel: string | null;
  children: ReactNode;
};

/**
 * Below this width the share page is scaled down rather than squeezed: its
 * layout uses viewport breakpoints, so a narrow card would cramp its grids.
 */
const LIVE_MIN_WIDTH_PX = 900;

/** The card's live report: the share page itself, fitted to the card's width. */
export function LiveReportFrame({ ready, failed, busyLabel, children }: Props) {
  return (
    <div className="relative border rounded-lg bg-background min-h-[200px] overflow-hidden">
      {failed ? (
        <p className="py-12 text-center text-sm text-destructive">
          לא ניתן ליצור קישור שיתוף לדוח הזה
        </p>
      ) : !ready ? (
        <LoadingState label="טוען את הדוח..." />
      ) : (
        <FitToWidth minWidth={LIVE_MIN_WIDTH_PX}>
          <Suspense fallback={<LoadingState label="טוען את הדוח..." />}>
            {children}
          </Suspense>
        </FitToWidth>
      )}
      {busyLabel && (
        <div className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground shadow-sm">
          <Loader2 className="h-3 w-3 animate-spin" />
          {busyLabel}
        </div>
      )}
    </div>
  );
}

/** A spinner with what is loading. */
function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
