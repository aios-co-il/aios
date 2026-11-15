import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import {
  type CollectorRunResult,
  RUNNABLE_COLLECTORS,
} from "../../../../supabase/functions/_shared/manager-round/runnable-collectors.ts";
import { useRunCheckNow } from "./useRunCheckNow";

/** Owner buttons that run one manager-round check now and show its result (AIO-597). */
export function RunChecksNow() {
  const { tenantId } = useCurrentTenant();
  const run = useRunCheckNow(tenantId);
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">הרצה ידנית</p>
      <ul className="space-y-1">
        {RUNNABLE_COLLECTORS.map((check) => {
          const running = run.isPending && run.variables === check.id;
          return (
            <li key={check.id} className="flex items-center gap-2 text-xs">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!tenantId || run.isPending}
                onClick={() => run.mutate(check.id)}
              >
                {running ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                <span className="sr-only">הרץ עכשיו: </span>
                {check.label}
              </Button>
              <span className="text-muted-foreground">{check.hint}</span>
            </li>
          );
        })}
      </ul>
      {run.isError && (
        <p className="text-xs text-destructive">{run.error.message}</p>
      )}
      {run.data && <p className="text-xs">{resultText(run.data)}</p>}
    </div>
  );
}

/** One line on what the run did. */
function resultText(result: CollectorRunResult): string {
  if (result.status !== "ok") {
    return `הבדיקה לא רצה (${result.reason ?? "סיבה לא ידועה"}).`;
  }
  const sent = result.mode === "observe" ? " במצב צפייה לא נשלח כלום." : "";
  return `נמצאו ${result.candidates} ממצאים (${result.inserted} חדשים, ${result.cleared} נסגרו), ${result.llmCalls} קריאות ל-AI.${sent}`;
}
