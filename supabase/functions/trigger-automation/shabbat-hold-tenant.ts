import type { DbClient } from "../_shared/supabase-clients.ts";

type HoldTenant =
  | { tenantId: string; refused?: undefined }
  | { refused: "task_not_found" | "foreign_tenant"; tenantId?: undefined };

/**
 * The tenant a held peer notification is stored and replayed with: one the
 * task belongs to, or one that shares the task's agency. The caller already
 * passed the tenant check for `bodyTenantId`.
 */
export async function holdTenantId(
  supabase: Pick<DbClient, "from">,
  taskId: string,
  bodyTenantId: string | null,
): Promise<HoldTenant> {
  const task = await taskTenantIds(supabase, taskId);
  const tenantIds = task?.tenantIds ?? [];
  if (!task || !tenantIds.length) {
    return { refused: "task_not_found" };
  }
  // A member of a tenant that shares the task's agency works on it like its own
  // (weekday notifications go out with that tenant), so hold it the same way.
  const sharedAgencyTenant =
    !!bodyTenantId &&
    !tenantIds.includes(bodyTenantId) &&
    (await tenantSharesTaskAgency(supabase, bodyTenantId, task.agencyId));
  if (
    bodyTenantId &&
    !tenantIds.includes(bodyTenantId) &&
    !sharedAgencyTenant
  ) {
    return { refused: "foreign_tenant" };
  }
  const tenantId =
    sharedAgencyTenant && bodyTenantId
      ? bodyTenantId
      : (tenantIds.find((id) => id === bodyTenantId) ?? tenantIds[0]);
  return { tenantId };
}

/** clients.tenant_id first (the Carmen routing tenant), then tasks.tenant_id. */
async function taskTenantIds(
  supabase: Pick<DbClient, "from">,
  taskId: string,
): Promise<{ tenantIds: string[]; agencyId: string | null } | null> {
  const { data: task, error } = await supabase
    .from("tasks")
    .select("tenant_id, client_id, agency_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!task) {
    return null;
  }
  let clientTenantId: string | null = null;
  if (task.client_id) {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("tenant_id")
      .eq("id", task.client_id)
      .maybeSingle();
    if (clientError) {
      throw clientError;
    }
    clientTenantId = client?.tenant_id || null;
  }
  return {
    tenantIds: [
      ...new Set(
        [clientTenantId, task.tenant_id].filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      ),
    ],
    agencyId: task.agency_id || null,
  };
}

/**
 * A tenant that sees the task through a shared agency (agency_tenant_access,
 * the same grant the "Shared-agency cross-tenant task view" policy uses).
 */
async function tenantSharesTaskAgency(
  supabase: Pick<DbClient, "from">,
  tenantId: string,
  agencyId: string | null,
): Promise<boolean> {
  if (!agencyId) {
    return false;
  }
  const { data, error } = await supabase
    .from("agency_tenant_access")
    .select("id")
    .eq("accessing_tenant_id", tenantId)
    .eq("agency_id", agencyId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return Boolean(data);
}
