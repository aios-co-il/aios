import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { requireTenantId } from "@/lib/requireTenantId";
import type { CardDraftsApproveResponse } from "../../../supabase/functions/_shared/manager-round/card-drafts-approve.ts";

/**
 * Approves the chosen drafts through carmen-card-drafts-approve, which writes
 * each one the caller may approve on the client card, then refreshes the
 * findings.
 */
export function useApproveCardDrafts(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (findingIds: Array<string>) => {
      const { data, error } =
        await supabase.functions.invoke<CardDraftsApproveResponse>(
          "carmen-card-drafts-approve",
          {
            body: {
              tenant_id: requireTenantId(tenantId),
              finding_ids: findingIds,
            },
          },
        );
      if (error || !data) {
        throw new Error("האישור נכשל");
      }
      return data.results;
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["carmen_findings", tenantId] }),
  });
}
