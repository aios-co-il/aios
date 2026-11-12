import type { QueryClient, QueryKey } from "@tanstack/react-query";

export type LeadListCacheSnapshot = Array<[QueryKey, unknown]>;

interface LeadRow {
  id: string;
}

type KanbanCache = Record<string, { leads?: Array<LeadRow> } | undefined>;

/**
 * Optimistically patches one lead in place in every leads table and Kanban
 * cache, so a field change shows before the write and its automations finish.
 * Returns the previous cache entries for `restoreLeadListCaches`.
 */
export function patchLeadInListCaches(
  queryClient: QueryClient,
  leadId: string,
  patch: Record<string, unknown>,
): LeadListCacheSnapshot {
  const snapshot: LeadListCacheSnapshot = [
    ...queryClient.getQueriesData({ queryKey: ["leads-table"] }),
    ...queryClient.getQueriesData({ queryKey: ["leads-kanban"] }),
  ];
  function patchRow<T extends LeadRow>(lead: T): T {
    return lead.id === leadId ? { ...lead, ...patch } : lead;
  }

  queryClient.setQueriesData<Array<LeadRow>>(
    { queryKey: ["leads-table"] },
    (old) => (Array.isArray(old) ? old.map(patchRow) : old),
  );
  queryClient.setQueriesData<KanbanCache>(
    { queryKey: ["leads-kanban"] },
    (old) => {
      if (!old || typeof old !== "object") {
        return old;
      }
      const updated: KanbanCache = {};
      for (const [stageKey, stage] of Object.entries(old)) {
        updated[stageKey] = Array.isArray(stage?.leads)
          ? { ...stage, leads: stage.leads.map(patchRow) }
          : stage;
      }
      return updated;
    },
  );
  return snapshot;
}

/** Restores the caches captured by `patchLeadInListCaches` after a failed write. */
export function restoreLeadListCaches(
  queryClient: QueryClient,
  snapshot: LeadListCacheSnapshot,
) {
  for (const [queryKey, data] of snapshot) {
    queryClient.setQueryData(queryKey, data);
  }
}
