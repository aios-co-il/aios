import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import type { ListPreview } from "@/hooks/useBroadcastLists";
import type { AudienceFilter } from "@/hooks/useBroadcasts";
import { requireTenantId } from "@/lib/requireTenantId";

export interface MaterializeOptions {
  mode: "preview" | "freeze";
  listId?: string;
  filter?: AudienceFilter;
}

/** CRM-filter lists: preview a filter (or a saved list), or freeze matches into a static list. */
export async function materializeList(
  tenantId: string,
  opts: MaterializeOptions,
): Promise<ListPreview> {
  const { data, error } = await supabase.functions.invoke(
    "broadcast-list-materialize",
    { body: { ...opts, tenantId } },
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as ListPreview;
}

/** Mutation around materializeList; refreshes the list (and its members) when it changed. */
export function useMaterializeList() {
  const { tenantId } = useCurrentTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: MaterializeOptions) =>
      materializeList(requireTenantId(tenantId), opts),
    onSuccess: (_data, opts) => {
      if (opts.mode !== "freeze" && !opts.listId) return;
      qc.invalidateQueries({ queryKey: ["broadcast-lists", tenantId] });
      if (opts.listId)
        qc.invalidateQueries({
          queryKey: ["broadcast-list-members", tenantId, opts.listId],
        });
    },
  });
}
