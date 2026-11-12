import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { type SyncableReportTable, syncReportTables } from "@/lib/reportSync";

/**
 * Syncs every source table of the client's dashboard, then reloads the live
 * dashboard so the card shows the fresh numbers.
 */
export function useDashboardSync(
  clientId: string,
  tenantId: string,
  shareToken: string | null,
) {
  const queryClient = useQueryClient();
  const tables = useQuery({
    queryKey: ["client-dashboard-tables", clientId, tenantId],
    queryFn:
      clientId && tenantId
        ? () => fetchClientTables(clientId, tenantId)
        : skipToken,
  });
  const sync = useMutation({
    mutationFn: () => syncReportTables(tables.data ?? []),
    onSuccess: async (results) => {
      await queryClient.invalidateQueries({
        queryKey: ["shared-dashboard", shareToken],
      });
      const failures = results.filter((result) => result.status === "failed");
      if (failures.length > 0) {
        toast.warning(
          `${failures.length} מקורות לא הסתנכרנו; יוצגו הנתונים האחרונים`,
        );
      } else {
        toast.success("נתוני הדשבורד סונכרנו");
      }
    },
    onError: (error) => {
      console.error("Dashboard sync failed:", error);
      toast.error(error.message || "סנכרון הדשבורד נכשל");
    },
  });

  return {
    sync: () => sync.mutate(),
    syncing: sync.isPending,
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
