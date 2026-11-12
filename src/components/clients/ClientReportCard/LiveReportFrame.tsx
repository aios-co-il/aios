import { Suspense, type ReactNode } from "react";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FitToWidth } from "./FitToWidth";
import type { ShareToken } from "./useShareToken";

type Props = {
  /** The share link the live report renders with; with none, the card offers to create one. */
  share: ShareToken;
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
export function LiveReportFrame({ share, busyLabel, children }: Props) {
  return (
    <div className="relative border rounded-lg bg-background min-h-[200px] overflow-hidden">
      {share.status === "failed" ? (
        <p className="py-12 text-center text-sm text-destructive">
          לא ניתן לקרוא את קישור השיתוף של הדוח הזה
        </p>
      ) : share.status === "loading" ? (
        <LoadingState label="טוען את הדוח..." />
      ) : share.status === "none" ? (
        <NoShareLink creating={share.creating} onCreate={share.create} />
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

/**
 * Shown when the report has no active share link: the live view, the send
 * and the PDF all need one, and a link the user turned off is never turned
 * back on, so the user creates a new one here.
 */
function NoShareLink({
  creating,
  onCreate,
}: {
  creating: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
      <span>אין לדוח הזה קישור שיתוף פעיל</span>
      <Button
        type="button"
        size="sm"
        className="gap-1"
        onClick={onCreate}
        disabled={creating}
      >
        {creating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Link2 className="h-3.5 w-3.5" />
        )}
        צור קישור
      </Button>
    </div>
  );
}
