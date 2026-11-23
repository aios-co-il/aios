import { useCarmenFindingsMutation } from "@/hooks/useCarmenFindingsMutation";
import { supabase } from "@/integrations/supabase/client";
import { requireTenantId } from "@/lib/requireTenantId";
import {
  CARD_DRAFTS_APPROVE_MAX,
  type CardDraftApproveResult,
  type CardDraftsApproveResponse,
} from "../../../supabase/functions/_shared/manager-round/card-drafts-approve.ts";

/**
 * Approves the chosen drafts through carmen-card-drafts-approve, which writes
 * each one the caller may approve on the client card, then refreshes the
 * findings. The function takes at most CARD_DRAFTS_APPROVE_MAX ids a call,
 * so a larger selection goes in batches; a batch that fails reports its ids
 * as errors and the rest still go.
 */
export function useApproveCardDrafts(tenantId: string | null) {
  return useCarmenFindingsMutation(
    tenantId,
    async (findingIds: Array<string>) => {
      const tenant = requireTenantId(tenantId);
      const results: Array<CardDraftApproveResult> = [];
      for (const batch of batches(findingIds, CARD_DRAFTS_APPROVE_MAX)) {
        results.push(...(await approveBatch(tenant, batch)));
      }
      return results;
    },
  );
}

/** One call's results; every id an error when the call failed. */
async function approveBatch(
  tenantId: string,
  findingIds: Array<string>,
): Promise<Array<CardDraftApproveResult>> {
  const { data, error } =
    await supabase.functions.invoke<CardDraftsApproveResponse>(
      "carmen-card-drafts-approve",
      { body: { tenant_id: tenantId, finding_ids: findingIds } },
    );
  if (error || !data) {
    console.error("[card-drafts] approve batch failed", error);
    return findingIds.map((id) => ({ id, status: "error" as const }));
  }
  return data.results;
}

/** `items` in consecutive slices of at most `size`. */
function batches<T>(items: Array<T>, size: number): Array<Array<T>> {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}
