import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireTenantId } from "@/lib/requireTenantId";
import {
  pulseTargetSaveKey,
  savePulseTargetToTables,
  type PulseTargetSaveInput,
} from "./pulseTargetSave";

/**
 * Saves an approved target (platform or one campaign) on the tenant's report
 * tables, then refreshes the pulse tables and records, after a failed save too,
 * so the editor shows what is stored. `savingKey` is the pulseTargetSaveKey of
 * the row being saved, for its spinner.
 */
export function useSavePulseTarget(tenantId: string | null | undefined) {
  const queryClient = useQueryClient();
  const refreshPulseTables = async () => {
    // The records query is keyed by the table ids, so the tables come first.
    await queryClient.invalidateQueries({ queryKey: ["pulse-dash-tables"] });
    void queryClient.invalidateQueries({ queryKey: ["pulse-dash-records"] });
  };
  const mutation = useMutation({
    mutationFn: async (input: PulseTargetSaveInput) => {
      const tenant = requireTenantId(tenantId);
      // set_by records who approved the target, so a failed lookup stops the save.
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        throw error;
      }
      await savePulseTargetToTables(input, tenant, data.user.id);
    },
    onSuccess: async (_saved, input) => {
      toast.success(input.value === null ? "היעד הוסר" : "היעד נשמר");
      await refreshPulseTables();
    },
    onError: async (error) => {
      toast.error(error?.message ?? "שמירת היעד נכשלה");
      await refreshPulseTables();
    },
  });
  return {
    save: mutation.mutate,
    savingKey:
      mutation.isPending && mutation.variables
        ? pulseTargetSaveKey(mutation.variables)
        : null,
  };
}
