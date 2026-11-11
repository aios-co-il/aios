// The caller may summarize only for a tenant they belong to (AIO-563): the
// summary writes that tenant's recording with the service role and bills that
// tenant's OpenRouter key, so the body's tenant_id is never trusted on its own.
import { tenantUserAccess } from "../_shared/auth/tenant-access.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** Whether the user is a member of the body's tenant or a super admin; a failed lookup says no. */
export async function callerMayUseTenant(
  sb: Pick<DbClient, "from" | "rpc">,
  tenantId: unknown,
  userId: string,
): Promise<boolean> {
  if (typeof tenantId !== "string" || !tenantId) {
    return false;
  }
  try {
    const access = await tenantUserAccess(sb, tenantId, userId);
    return access.member || access.superAdmin;
  } catch (err) {
    console.error(
      "[summarize-recording] tenant access check failed",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
