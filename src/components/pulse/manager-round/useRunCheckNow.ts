import { useCarmenFindingsMutation } from "@/hooks/useCarmenFindingsMutation";
import { supabase } from "@/integrations/supabase/client";
import type {
  CollectorRunResult,
  RunnableCollectorId,
} from "../../../../supabase/functions/_shared/manager-round/runnable-collectors.ts";

/**
 * Runs one manager-round check now for the tenant (carmen-manager-round-run,
 * AIO-597) and refreshes the open findings it may have changed.
 */
export function useRunCheckNow(tenantId: string | null) {
  return useCarmenFindingsMutation(
    tenantId,
    async (collector: RunnableCollectorId) => {
      if (!tenantId) {
        throw new Error("אין ארגון פעיל");
      }
      const { data, error } =
        await supabase.functions.invoke<CollectorRunResult>(
          "carmen-manager-round-run",
          { body: { tenant_id: tenantId, collector } },
        );
      if (error || !data) {
        throw new Error("ההרצה נכשלה");
      }
      return data;
    },
  );
}
