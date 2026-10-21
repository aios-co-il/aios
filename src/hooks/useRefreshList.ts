import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import type { ListPreview } from "@/hooks/useBroadcastLists";
import type { AudienceFilter } from "@/hooks/useBroadcasts";
import { requireTenantId } from "@/lib/requireTenantId";

export interface RefreshListOptions {
  /** `preview` writes nothing; `refresh` replaces the list's members with the current matches. */
  mode: "preview" | "refresh";
  listId?: string;
  filter?: AudienceFilter;
}

/** CRM-filter lists: preview a filter (or a saved list), or refresh a list's members from it. */
export async function refreshList(
  tenantId: string,
  opts: RefreshListOptions,
): Promise<ListPreview> {
  const { data, error } = await supabase.functions.invoke(
    "broadcast-list-materialize",
    { body: { ...opts, tenantId } },
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as ListPreview;
}

/** Mutation around refreshList; refetches the list (and its members) after a refresh. */
export function useRefreshList() {
  const { tenantId } = useCurrentTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: RefreshListOptions) =>
      refreshList(requireTenantId(tenantId), opts),
    onSuccess: (_data, opts) => {
      if (opts.mode !== "refresh") return;
      qc.invalidateQueries({ queryKey: ["broadcast-lists", tenantId] });
      if (opts.listId)
        qc.invalidateQueries({
          queryKey: ["broadcast-list-members", tenantId, opts.listId],
        });
    },
  });
}
