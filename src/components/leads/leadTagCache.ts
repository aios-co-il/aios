import type { QueryClient, QueryKey } from "@tanstack/react-query";

type LeadTagMap = Record<string, Array<string>>;

export type LeadTagCacheSnapshot = Array<[QueryKey, unknown]>;

/** Bulk tag maps that the leads Kanban and table render tag chips from. */
const BULK_TAG_MAP_PREFIXES = ["leads-tags-visible", "leads-tags-table"];

/**
 * Optimistically adds or removes one tag on a lead in every cache that renders
 * it: the per-lead list and the bulk maps behind the Kanban and table. Without
 * the bulk maps the chips only change after the write and a full refetch.
 */
export function applyLeadTagChange(
  queryClient: QueryClient,
  { tenantId, leadId, tagId, assign }: LeadTagChange,
): LeadTagCacheSnapshot {
  const bulkFilters = BULK_TAG_MAP_PREFIXES.map((prefix) => ({
    queryKey: [prefix, tenantId],
  }));
  const snapshot: LeadTagCacheSnapshot = [
    [["lead-tags", leadId], queryClient.getQueryData(["lead-tags", leadId])],
    ...bulkFilters.flatMap((filters) => queryClient.getQueriesData(filters)),
  ];

  queryClient.setQueryData<Array<string>>(["lead-tags", leadId], (old) =>
    toggleTag(old ?? [], tagId, assign),
  );
  for (const filters of bulkFilters) {
    queryClient.setQueriesData<LeadTagMap>(filters, (old) =>
      old
        ? { ...old, [leadId]: toggleTag(old[leadId] ?? [], tagId, assign) }
        : old,
    );
  }
  return snapshot;
}

/** Restores the caches captured by `applyLeadTagChange` after a failed write. */
export function restoreLeadTagCaches(
  queryClient: QueryClient,
  snapshot: LeadTagCacheSnapshot,
) {
  for (const [queryKey, data] of snapshot) {
    queryClient.setQueryData(queryKey, data);
  }
}

/** Returns the tag list with `tagId` present when `assign`, absent otherwise. */
function toggleTag(tagIds: Array<string>, tagId: string, assign: boolean) {
  const without = tagIds.filter((id) => id !== tagId);
  return assign ? [...without, tagId] : without;
}

interface LeadTagChange {
  tenantId: string | null | undefined;
  leadId: string;
  tagId: string;
  assign: boolean;
}
