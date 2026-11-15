import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateReportTables } from "@/lib/invalidateReportTables";
import {
  type AdsRangeSyncResult,
  type AdsSyncTable,
  planSyncPieces,
  syncAdsTableRange,
} from "@/lib/adsRangeSync/syncAdsTableRange";
import { rangeSyncFailureMessage } from "@/lib/adsRangeSync/rangeSyncFailureMessage";
import type { SyncDateSelection } from "@/lib/adsRangeSync/syncWindow";

export type AdsRangeSyncVariables = {
  tables: ReadonlyArray<AdsSyncTable>;
  selection: SyncDateSelection;
};

type Progress = { done: number; total: number };

/**
 * Syncs ads report tables for the date range the screen shows: 30 days per
 * request, newest first, one table's pieces after one another (tables run
 * side by side). Each table stops at its first failed piece; the pieces before
 * it stay. Reloads the report tables and records afterwards, failure or not.
 *
 * With `notify`, a sync of one table reports its own result in a toast; a
 * caller that combines several sources passes `notify: false` and reads the
 * returned results.
 */
export function useAdsRangeSync(options: {
  tenantId: string | null | undefined;
  notify?: boolean;
}) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<Progress | null>(null);
  const notify = options.notify ?? true;

  const mutation = useMutation({
    mutationFn: ({ tables, selection }: AdsRangeSyncVariables) => {
      const pieces = planSyncPieces(selection);
      const total = pieces.length * tables.length;
      let done = 0;
      setProgress({ done, total });
      return Promise.all(
        tables.map((table) =>
          syncAdsTableRange(table, pieces, {
            onPieceDone: () => {
              done += 1;
              setProgress({ done, total });
            },
          }),
        ),
      );
    },
    onSuccess: (results) => {
      if (notify) {
        notifyRangeSync(results);
      }
    },
    onError: (error) => {
      console.error("[useAdsRangeSync] sync failed", error);
      if (notify) {
        toast.error(`הסנכרון נכשל: ${error.message}`);
      }
    },
    onSettled: (_results, _error, variables) => {
      setProgress(null);
      return Promise.all([
        invalidateReportTables(queryClient, options.tenantId),
        ...variables.tables.map((table) =>
          queryClient.invalidateQueries({
            queryKey: ["crm-records", table.id],
          }),
        ),
      ]);
    },
  });

  return {
    sync: mutation.mutate,
    /** For a caller that awaits this sync beside other sources. */
    syncAsync: mutation.mutateAsync,
    syncing: mutation.isPending,
    progressLabel: mutation.isPending ? rangeSyncProgressLabel(progress) : null,
  };
}

/** "מסנכרן 2/4…" while piece 2 of 4 runs; "מסנכרן…" for a single request. */
export function rangeSyncProgressLabel(progress: Progress | null): string {
  if (!progress || progress.total <= 1) {
    return "מסנכרן…";
  }
  const current = Math.min(progress.done + 1, progress.total);
  return `מסנכרן ${current}/${progress.total}…`;
}

/** One toast for the run: the first failure, or the rows synced. */
function notifyRangeSync(results: ReadonlyArray<AdsRangeSyncResult>): void {
  const failed = results.find((result) => result.failure);
  if (failed) {
    toast.error(rangeSyncFailureMessage(failed), { duration: 12000 });
    return;
  }
  const rows = results.reduce((sum, result) => sum + result.recordsSynced, 0);
  const byLevel = results.length === 1 ? results[0].byLevel : null;
  const levelNote = byLevel
    ? ` — קמפיינים: ${byLevel.campaign}, ad sets: ${byLevel.adset}, מודעות: ${byLevel.ad}`
    : "";
  toast.success(`הנתונים סונכרנו (${rows} שורות${levelNote})`);
}
