import { useEffect } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { Button } from "@/components/ui/button";
import type { ReportData } from "./data/reportData";
import { useCarmenInsight } from "./useCarmenInsight";

/**
 * Carmen's block at the end of the report. She reads it only when asked:
 * the button sends the figures on screen, and a new date range or comparison
 * clears her answer, since it described other numbers.
 */
export function CarmenInsight({ data }: { data: ReportData }) {
  const {
    mutate,
    reset,
    data: insight,
    isPending,
    isError,
  } = useCarmenInsight();
  useEffect(() => reset(), [data, reset]);
  return (
    <aside className="flex items-center gap-4 rounded-2xl border border-brand-accent/30 bg-gradient-to-l from-brand-accent/15 via-brand-accent/5 to-transparent p-4 shadow-elevation-1">
      <CarmenOrb className="h-11 w-11 shrink-0" />
      <div className="h-10 w-px shrink-0 bg-border" aria-hidden="true" />
      <div className="min-w-0 flex-1" aria-live="polite">
        <p className="font-bold">כרמן</p>
        <p className="text-sm text-muted-foreground">
          {insight ??
            (isError
              ? "לא הצלחתי לקרוא את הדוח עכשיו. נסה שוב."
              : "רוצה שאקרא את הדוח ואגיד מה בולט בו?")}
        </p>
      </div>
      <Button
        variant={insight ? "ghost" : "default"}
        size="sm"
        className="shrink-0 gap-1.5"
        disabled={isPending}
        onClick={() => mutate(data)}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : insight ? (
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        )}
        {isPending ? "כרמן קוראת…" : insight ? "תובנה חדשה" : "בקש תובנה מכרמן"}
      </Button>
    </aside>
  );
}
