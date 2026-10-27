/**
 * What get_reconciliation_status may show a caller (AIO-238), mirroring the
 * reconcile_runs read policy (which follows crm_tables): all report tables of
 * the caller's tenant, and in a source tenant only the clients of the agency it
 * shares, never that tenant's other agencies or its tenant-level rows.
 */
import { CRM_RECORDS_PAGE_SIZE } from "../_shared/reconcile/tables.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

export type ReconcileStatusScope = {
  /** The caller's own tenant: every table run in it is in scope. */
  ownTenantId: string;
  /** Tenant-level runs (table_id NULL) of the own tenant: owners and super admins only. */
  includeTenantLevel: boolean;
  /** Clients of the agencies other tenants share with this one (agency_tenant_access). */
  sharedClientIds: string[];
};

/** Roles that may see tenant-level rows (unmapped ad accounts), as RLS allows. */
const TENANT_LEVEL_ROLES = ["owner", "super_admin"];

/** The caller's scope: own tenant, shared-agency clients, and tenant-level rows by role. */
export async function reconcileStatusScope(
  db: Pick<DbClient, "from">,
  opts: { tenantId: string; callerRoles: string[] },
): Promise<ReconcileStatusScope> {
  const { data: shares, error } = await db
    .from("agency_tenant_access")
    .select("source_tenant_id, agency_id")
    .eq("accessing_tenant_id", opts.tenantId);
  if (error) {
    throw new Error(`agency_tenant_access: ${error.message}`);
  }
  const agenciesBySource = new Map<string, Set<string>>();
  for (const share of shares || []) {
    const source = share?.source_tenant_id;
    const agency = share?.agency_id;
    if (!source || !agency || source === opts.tenantId) {
      continue;
    }
    const set = agenciesBySource.get(source) || new Set<string>();
    set.add(agency);
    agenciesBySource.set(source, set);
  }
  const sharedClientIds: string[] = [];
  for (const [source, agencies] of agenciesBySource) {
    sharedClientIds.push(...(await agencyClientIds(db, source, agencies)));
  }
  return {
    ownTenantId: opts.tenantId,
    includeTenantLevel: opts.callerRoles.some((role) =>
      TENANT_LEVEL_ROLES.includes(role),
    ),
    sharedClientIds,
  };
}

/**
 * The roles `userId` holds in `tenantId`: rows for that tenant plus global
 * rows (tenant_id NULL). A role in another tenant does not count, so an owner
 * of one org is not a manager in the org that only shares clients with it.
 * The tenant filter runs here, not in a PostgREST `or` string, so the tenant
 * id never becomes filter syntax.
 */
export async function rolesInTenant(
  db: Pick<DbClient, "from">,
  tenantId: string,
  userId: string | null,
): Promise<string[]> {
  if (!userId) {
    return [];
  }
  const { data, error } = await db
    .from("user_roles")
    .select("role, tenant_id")
    .eq("user_id", userId);
  if (error) {
    throw new Error(`user_roles: ${error.message}`);
  }
  return (data || [])
    .filter((row) => row.tenant_id === tenantId || row.tenant_id === null)
    .map((row) => row.role);
}

/** True when `clientId` is the caller's own tenant's client or a shared-agency client. */
export async function clientInScope(
  db: Pick<DbClient, "from">,
  scope: ReconcileStatusScope,
  clientId: string,
): Promise<boolean> {
  if (scope.sharedClientIds.includes(clientId)) {
    return true;
  }
  const { data, error } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", scope.ownTenantId)
    .maybeSingle();
  if (error) {
    throw new Error(`clients: ${error.message}`);
  }
  return !!data;
}

/** Every client of `agencies` in tenant `source`, paged. */
async function agencyClientIds(
  db: Pick<DbClient, "from">,
  source: string,
  agencies: Set<string>,
): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += CRM_RECORDS_PAGE_SIZE) {
    const { data, error } = await db
      .from("clients")
      .select("id")
      .eq("tenant_id", source)
      .in("agency_id", [...agencies])
      .order("id", { ascending: true })
      .range(from, from + CRM_RECORDS_PAGE_SIZE - 1);
    if (error) {
      throw new Error(`clients: ${error.message}`);
    }
    for (const c of data || []) {
      if (c?.id) {
        ids.push(c.id);
      }
    }
    if ((data || []).length < CRM_RECORDS_PAGE_SIZE) {
      return ids;
    }
  }
}
