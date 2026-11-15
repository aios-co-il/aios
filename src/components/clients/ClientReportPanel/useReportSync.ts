import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sharedTableKey } from "@/components/SharedTable/publicTableApi";
import { useAdsRangeSync } from "@/hooks/useAdsRangeSync";
import { isAdsSyncTable } from "@/lib/adsRangeSync/syncAdsTableRange";
import { rangeSyncFailureMessage } from "@/lib/adsRangeSync/rangeSyncFailureMessage";
import type { SyncDateSelection } from "@/lib/adsRangeSync/syncWindow";
import { type SyncableReportTable, syncReportTable } from "@/lib/reportSync";

/**
 * Syncs the report's source, then reloads the live report (and the internal
 * report reads) so the card shows the fresh numbers. An ads report syncs the
 * window picked on the card (useAdsRangeSync); other sources keep their own
 * windows (reportSync).
 */
export function useReportSync(
  table: SyncableReportTable,
  tenantId: string,
  shareToken: string | null,
  selection: SyncDateSelection,
) {
  const queryClient = useQueryClient();
  const adsSync = useAdsRangeSync({ tenantId, notify: false });
  /** Reloads the live report and the internal report reads. */
  function reloadReport() {
    return Promise.all([
      shareToken &&
        queryClient.invalidateQueries({
          queryKey: sharedTableKey(shareToken),
        }),
      queryClient.invalidateQueries({
        queryKey: ["client-report-data", table.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ["ahrefs-reports", tenantId],
      }),
    ]);
  }
  const sourceSync = useMutation({
    mutationFn: async () => {
      const result = await syncReportTable(table);
      if (result.status === "failed") {
        throw new Error(result.error);
      }
    },
    onSuccess: reloadReport,
    onError: (error) => {
      console.error("Report sync failed:", error);
      toast.error("סנכרון הדוח נכשל");
    },
  });

  // Hook-level callbacks still run after the card closes; mutate-level ones
  // do not, and the reload must not be skipped.
  const adsReportSync = useMutation({
    mutationFn: () => adsSync.syncAsync({ tables: [table], selection }),
    onSuccess: ([result]) => {
      if (result?.failure) {
        toast.error(rangeSyncFailureMessage(result));
      }
    },
    onError: (error) => {
      console.error("Report sync failed:", error);
      toast.error(error.message || "סנכרון הדוח נכשל");
    },
    // Pieces written before a failure stay, so reload either way.
    onSettled: reloadReport,
  });

  /** An ads report syncs the picked window; any other source its own. */
  function sync() {
    if (isAdsSyncTable(table)) {
      adsReportSync.mutate();
    } else {
      sourceSync.mutate();
    }
  }

  return {
    sync,
    syncing: sourceSync.isPending || adsReportSync.isPending,
    progressLabel: adsSync.progressLabel,
  };
}
