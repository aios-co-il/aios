import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sharedTableKey } from "@/components/SharedTable/publicTableApi";
import { type SyncableReportTable, syncReportTable } from "@/lib/reportSync";

/**
 * Syncs the report's source, then reloads the live report (and the internal
 * report reads) so the card shows the fresh numbers.
 */
export function useReportSync(
  table: SyncableReportTable,
  tenantId: string,
  shareToken: string | null,
) {
  const queryClient = useQueryClient();
  const sync = useMutation({
    mutationFn: async () => {
      const result = await syncReportTable(table);
      if (result.status === "failed") {
        throw new Error(result.error);
      }
    },
    onSuccess: () =>
      Promise.all([
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
      ]),
    onError: (error) => {
      console.error("Report sync failed:", error);
      toast.error("סנכרון הדוח נכשל");
    },
  });
  return { sync: () => sync.mutate(), syncing: sync.isPending };
}
