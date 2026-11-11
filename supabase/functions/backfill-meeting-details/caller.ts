// Who may run the backfill (AIO-563): it renames and reassigns every summarized
// meeting in the tenant and spends the tenant's OpenRouter key, so only the
// service role, a super admin, or the tenant's owner.
import { isSuperAdminUser } from "../_shared/auth/tenant-access.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** Whether the signed-in user may run the backfill for the tenant. */
export async function userMayRunBackfill(
  sb: Pick<DbClient, "from" | "rpc">,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  if (await isSuperAdminUser(sb, userId)) {
    return true;
  }
  const { data, error } = await sb
    .from("user_roles")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("role", "owner")
    .limit(1);
  if (error) {
    throw new Error(`user_roles lookup failed: ${error.message}`);
  }
  return (data ?? []).length > 0;
}
