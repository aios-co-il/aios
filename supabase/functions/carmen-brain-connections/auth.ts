import type { DbClient } from "../_shared/supabase-clients.ts";
import { check, HttpError } from "./request.ts";

// Only owners manage brain keys; a free-text tenant_users role such as
// "admin" is not one of them.
const MANAGER_ROLES = new Set(["owner", "agency_owner"]);

/** How the caller manages this tenant's brains. */
export type ManagerAccess = {
  /** A super admin whose acting tenant (get_user_tenant_id) is this one. */
  superAdminActing: boolean;
};

/**
 * Owners and agency owners of this tenant, or a super admin acting in it: a
 * super admin writes only in the tenant they act in (TENANT_ISOLATION.md,
 * AIO-354). Checked on every action, so the settings screen is not the only
 * gate; anyone else gets 403.
 */
export async function requireManager(
  sb: DbClient,
  userId: string,
  tenantId: string,
): Promise<ManagerAccess> {
  const roles = await sb
    .from("user_roles")
    .select("role, tenant_id")
    .eq("user_id", userId);
  check(roles.error, "Role lookup");
  const rows = roles.data ?? [];
  const superAdmin = rows.some((r) => r.role === "super_admin" && !r.tenant_id);
  if (superAdmin && (await actingTenantId(sb, userId)) === tenantId) {
    return { superAdminActing: true };
  }
  const ownerByRole = rows.some(
    (r) => r.tenant_id === tenantId && MANAGER_ROLES.has(r.role),
  );
  if (!ownerByRole && !(await isOwnerMember(sb, userId, tenantId))) {
    throw new HttpError(403, "Only tenant owners can manage Carmen's brains");
  }
  return { superAdminActing: false };
}

/** The tenant the user acts in (get_user_tenant_id); null when none. */
async function actingTenantId(
  sb: DbClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await sb.rpc("get_user_tenant_id", {
    _user_id: userId,
  });
  check(error, "Acting tenant lookup");
  return typeof data === "string" ? data : null;
}

/** Whether the user's tenant_users role in this tenant is a manager role. */
async function isOwnerMember(
  sb: DbClient,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const member = await sb
    .from("tenant_users")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  check(member.error, "Membership lookup");
  return MANAGER_ROLES.has(member.data?.role ?? "");
}
