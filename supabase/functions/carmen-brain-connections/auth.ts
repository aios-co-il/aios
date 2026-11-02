import type { DbClient } from "../_shared/supabase-clients.ts";
import { check } from "./request.ts";

// Only owners manage brain keys; a free-text tenant_users role such as
// "admin" is not one of them.
const MANAGER_ROLES = new Set(["owner", "agency_owner"]);

/**
 * Owners and agency owners of this tenant, or super admins. Checked on every
 * action, so the settings screen is not the only gate.
 */
export async function isTenantManager(
  sb: DbClient,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const roles = await sb
    .from("user_roles")
    .select("role, tenant_id")
    .eq("user_id", userId);
  check(roles.error, "Role lookup");
  const byRole = (roles.data ?? []).some(
    (r) =>
      (r.role === "super_admin" && !r.tenant_id) ||
      (r.tenant_id === tenantId && MANAGER_ROLES.has(r.role)),
  );
  if (byRole) return true;

  const member = await sb
    .from("tenant_users")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  check(member.error, "Membership lookup");
  return MANAGER_ROLES.has(member.data?.role ?? "");
}
