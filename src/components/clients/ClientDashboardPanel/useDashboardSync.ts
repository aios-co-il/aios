import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdsRangeSync } from "@/hooks/useAdsRangeSync";
import { isAdsSyncTable } from "@/lib/adsRangeSync/syncAdsTableRange";
import type { SyncDateSelection } from "@/lib/adsRangeSync/syncWindow";
import { rangeSyncFailureMessage } from "@/lib/adsRangeSync/rangeSyncFailureMessage";
import { type SyncableReportTable, syncReportTables } from "@/lib/reportSync";

/**
 * Syncs every source table of the client's dashboard, then reloads the live
 * dashboard so the card shows the fresh numbers. Ads tables sync the
 * dashboard's picked window, custom range included, 30 days per request.
 */
export function useDashboardSync(
  clientId: string,
  tenantId: string,
  shareToken: string | null,
  selection: SyncDateSelection,
) {
  const queryClient = useQueryClient();
  const tables = useQuery({
    queryKey: ["client-dashboard-tables", clientId, tenantId],
    queryFn:
      clientId && tenantId
        ? () => fetchClientTables(clientId, tenantId)
        : skipToken,
  });
  const adsSync = useAdsRangeSync({ tenantId, notify: false });
  const sync = useMutation({
    mutationFn: () => syncDashboardSources(tables.data ?? []),
    onSuccess: async ({ sourceFailures, adsResults }) => {
      await queryClient.invalidateQueries({
        queryKey: ["shared-dashboard", shareToken],
      });
      const adsFailures = adsResults.filter((result) => result.failure);
      const failures = sourceFailures + adsFailures.length;
      if (adsFailures.length > 0) {
        toast.error(rangeSyncFailureMessage(adsFailures[0]));
      }
      if (failures > 0) {
        toast.warning(`${failures} מקורות לא הסתנכרנו; יוצגו הנתונים האחרונים`);
      } else {
        toast.success("נתוני הדשבורד סונכרנו");
      }
    },
    onError: (error) => {
      console.error("Dashboard sync failed:", error);
      toast.error(error.message || "סנכרון הדשבורד נכשל");
    },
  });

  /**
   * Ads tables sync the window picked on the card (useAdsRangeSync), beside
   * the other sources, which keep their own windows (reportSync).
   */
  async function syncDashboardSources(all: Array<SyncableReportTable>) {
    const adsTables = all.filter(isAdsSyncTable);
    const [sourceResults, adsResults] = await Promise.all([
      syncReportTables(all.filter((table) => !isAdsSyncTable(table))),
      adsTables.length
        ? adsSync.syncAsync({
            tables: adsTables,
            selection,
          })
        : Promise.resolve([]),
    ]);
    const sourceFailures = sourceResults.filter(
      (result) => result.status === "failed",
    ).length;
    return { sourceFailures, adsResults };
  }

  return {
    sync: () => sync.mutate(),
    syncing: sync.isPending,
    progressLabel: adsSync.progressLabel,
    loadingTables: tables.isLoading,
  };
}

/** The tenant's report tables that belong to this client. */
async function fetchClientTables(
  clientId: string,
  tenantId: string,
): Promise<Array<SyncableReportTable>> {
  const response = await supabase.functions.invoke(
    `crm-tables?tenant_id=${tenantId}`,
    { method: "GET" },
  );
  if (response.error) {
    throw response.error;
  }
  const allTables: Array<SyncableReportTable> = Array.isArray(response.data)
    ? response.data
    : [];
  return allTables.filter((table) => table.client_id === clientId);
}
