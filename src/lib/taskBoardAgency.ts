export type AgencyScopedTask = {
  agency_id?: string | null;
  client_id?: string | null;
  clients?: { agency_id?: string | null } | null;
};

/**
 * The agency a task really belongs to.
 *
 * `tasks.agency_id` is only a stamp taken at creation time, and historically it
 * was taken from the creator's default agency rather than the client's. When a
 * task is linked to a client, the client's agency is the source of truth — the
 * same rule the Carmen notification router already uses for outbound routing.
 */
export function resolveTaskEffectiveAgency(
  task: AgencyScopedTask,
): string | null {
  const clientAgencyId = task.clients?.agency_id;
  if (task.client_id && clientAgencyId) return clientAgencyId;
  return task.agency_id ?? null;
}

/**
 * Agency stamp for a task being created or re-linked. A task that belongs to a
 * client must carry that client's agency, whatever the header filter says;
 * otherwise it falls back to the selected agency, then the tenant's first one.
 */
export function resolveNewTaskAgency(input: {
  clientAgencyId?: string | null;
  selectedAgency?: string | null;
  fallbackAgencyId?: string | null;
}): string | null {
  const { clientAgencyId, selectedAgency, fallbackAgencyId } = input;
  if (clientAgencyId) return clientAgencyId;
  if (selectedAgency && selectedAgency !== "all") return selectedAgency;
  return fallbackAgencyId ?? null;
}

/**
 * Agency for tasks created from the weekly board / calendar overlay when no
 * client is involved (quick add, calendar slot, backlog line).
 */
export function resolveBoardTaskAgency(
  selectedAgency: string | null | undefined,
  fallbackAgencyId: string | null | undefined,
): string | null {
  return resolveNewTaskAgency({ selectedAgency, fallbackAgencyId });
}

/**
 * Client-side guard: when the header picks a specific agency, only tasks whose
 * effective agency matches may render. "all" (or empty) leaves the list alone.
 */
export function filterTasksBySelectedAgency<T extends AgencyScopedTask>(
  tasks: T[],
  selectedAgency: string | null | undefined,
): T[] {
  if (!selectedAgency || selectedAgency === "all") return tasks;
  return tasks.filter(
    (task) => resolveTaskEffectiveAgency(task) === selectedAgency,
  );
}

type BoardTenantScopedTask = AgencyScopedTask & {
  tenant_id?: string | null;
};

/**
 * A tenant that holds one of this tenant's own agencies through
 * agency_tenant_access. Tasks it creates on that agency carry its tenant_id.
 */
export type OwnedAgencyShare = { agencyId: string; tenantId: string };

/**
 * Active-tenant guard for the tasks board.
 *
 * - Rows stamped with the URL/effective tenant always belong.
 * - Rows on one of this tenant's own agencies belong when they are stamped
 *   with a tenant that agency is shared with, the same pairs the
 *   "Own-agency task view across tenants" policy reads. A super admin reads
 *   every tenant, so an unshared stamp must not reach the board.
 * - Other cross-tenant rows appear only when linked to a client whose agency
 *   is shared into this tenant via agency_tenant_access.
 */
export function taskBelongsToBoardTenantScope(
  task: BoardTenantScopedTask,
  tenantId: string,
  sharedAgencyIds: string[],
  ownedAgencyShares: OwnedAgencyShare[] = [],
): boolean {
  if (!tenantId) return true;
  if (task.tenant_id === tenantId) return true;
  if (
    ownedAgencyShares.some(
      (share) =>
        share.agencyId === task.agency_id && share.tenantId === task.tenant_id,
    )
  ) {
    return true;
  }
  if (!task.client_id) return false;
  const clientAgencyId = task.clients?.agency_id;
  if (!clientAgencyId) return false;
  return sharedAgencyIds.includes(clientAgencyId);
}

export function filterTasksByBoardTenantScope<T extends BoardTenantScopedTask>(
  tasks: T[],
  tenantId: string,
  sharedAgencyIds: string[],
  ownedAgencyShares: OwnedAgencyShare[] = [],
): T[] {
  if (!tenantId) return tasks;
  return tasks.filter((task) =>
    taskBelongsToBoardTenantScope(
      task,
      tenantId,
      sharedAgencyIds,
      ownedAgencyShares,
    ),
  );
}

/**
 * PostgREST `.or()` scope for the tasks board fetch.
 *
 * Own-tenant rows, shared-agency rows the user may read cross-tenant, and
 * rows on this tenant's own agencies stamped with a tenant each is shared with.
 * Person-queue narrowing (mine / named campaigner) is applied in a separate
 * ANDed filter — never OR `tenant_id` with `campaigner_id` here, or every row
 * in the tenant matches the scope clause alone.
 */
export function buildTasksBoardScopeOrFilter(scope: TasksBoardScope): string {
  const parts = [`tenant_id.eq.${scope.tenantId}`];
  if (
    scope.type === "tenant_or_shared" &&
    scope.crossTenantAgencyIds.length > 0
  ) {
    parts.push(`agency_id.in.(${scope.crossTenantAgencyIds.join(",")})`);
  }
  if (scope.type === "tenant_or_shared") {
    for (const share of scope.ownedAgencyShares) {
      parts.push(
        `and(agency_id.eq.${share.agencyId},tenant_id.eq.${share.tenantId})`,
      );
    }
  }
  return parts.join(",");
}

/**
 * Tenant scope for the board query.
 *
 * The header agency is deliberately NOT pushed into the query: a task can be
 * stamped with one agency while its client belongs to another, so filtering
 * server-side on `agency_id` both leaks foreign tasks and hides tasks that
 * really belong to the selected agency. The effective-agency filter above does
 * the narrowing on rows the tenant may already read.
 */
export type TasksBoardScope =
  | {
      type: "tenant_or_shared";
      tenantId: string;
      crossTenantAgencyIds: string[];
      ownedAgencyShares: OwnedAgencyShare[];
    }
  | { type: "tenant"; tenantId: string };

export function resolveTasksBoardScope(input: {
  tenantId: string;
  crossTenantAgencyIds?: string[];
  ownedAgencyShares?: OwnedAgencyShare[];
}): TasksBoardScope {
  const { tenantId, crossTenantAgencyIds = [], ownedAgencyShares = [] } = input;
  const sharedAgencyIds = Array.from(new Set(crossTenantAgencyIds));
  if (sharedAgencyIds.length > 0 || ownedAgencyShares.length > 0) {
    return {
      type: "tenant_or_shared",
      tenantId,
      crossTenantAgencyIds: sharedAgencyIds,
      ownedAgencyShares,
    };
  }
  return { type: "tenant", tenantId };
}

/**
 * Sync helper for localTasks: while a refetch is in flight we keep the previous
 * list to avoid an empty flash — but we MUST still narrow by selectedAgency so
 * switching the header filter cannot keep other agencies' tasks on screen.
 */
export type CampaignerScopedTask = AgencyScopedTask & {
  campaigner_id?: string | null;
  sales_person_id?: string | null;
  created_by?: string | null;
};

export function syncLocalTasksForAgencyFilter<
  T extends CampaignerScopedTask,
>(input: {
  isFetching: boolean;
  fetchedTasks: T[] | undefined | null;
  previousLocal: T[];
  selectedAgency: string | null | undefined;
  /** Client-side guard while refetching after a campaigner filter change. */
  applyCampaignerFilter?: (tasks: T[]) => T[];
}): T[] {
  const {
    isFetching,
    fetchedTasks,
    previousLocal,
    selectedAgency,
    applyCampaignerFilter,
  } = input;
  const base = filterTasksBySelectedAgency(
    isFetching ? previousLocal : (fetchedTasks ?? []),
    selectedAgency,
  );
  return applyCampaignerFilter ? applyCampaignerFilter(base) : base;
}
