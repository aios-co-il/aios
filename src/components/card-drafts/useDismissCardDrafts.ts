import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** One dismissal's outcome; `error` is the database's refusal (e.g. owner_only). */
export type DismissResult = { id: string; error: string | null };

/**
 * Dismisses the chosen drafts one by one through carmen_finding_set_status,
 * which allows it to the tenant's owners only, and refreshes the findings.
 */
export function useDismissCardDrafts(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      findingIds: Array<string>,
    ): Promise<Array<DismissResult>> => {
      const results: Array<DismissResult> = [];
      for (const id of findingIds) {
        const { error } = await supabase.rpc("carmen_finding_set_status", {
          p_finding_id: id,
          p_status: "dismissed",
        });
        if (error) {
          console.error("[card-drafts] dismiss refused", id, error.message);
        }
        results.push({ id, error: error?.message ?? null });
      }
      return results;
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["carmen_findings", tenantId] }),
  });
}
