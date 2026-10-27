import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  pulseTargetSaveKey,
  savePulseTargetToTables,
  type PulseTargetSaveInput,
} from "@/lib/pulseTargetSave";

/**
 * Saves an approved target (platform or one campaign) on the tenant's report
 * tables, then refreshes the pulse tables and records. `savingKey` is the
 * pulseTargetSaveKey of the row being saved, for its spinner.
 */
export function useSavePulseTarget(tenantId: string | null | undefined) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: PulseTargetSaveInput) => {
      if (!tenantId) {
        throw new Error("שמירת היעד נכשלה");
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await savePulseTargetToTables(input, tenantId, user?.id ?? null);
    },
    onSuccess: async (_saved, input) => {
      toast.success(input.value === null ? "היעד הוסר" : "היעד נשמר");
      // The records query is keyed by the table ids, so the tables come first.
      await queryClient.invalidateQueries({ queryKey: ["pulse-dash-tables"] });
      void queryClient.invalidateQueries({ queryKey: ["pulse-dash-records"] });
    },
    onError: (error) => {
      toast.error(error?.message ?? "שמירת היעד נכשלה");
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
