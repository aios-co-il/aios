/** One of the caller's user_roles rows. */
export type CallerRole = { role: string; tenant_id: string | null };

/** A global super_admin row; is_super_admin ignores tenant-scoped ones, so every grant check does too. */
export function isGlobalSuperAdmin(roles: readonly CallerRole[]): boolean {
  return roles.some((r) => r.role === "super_admin" && r.tenant_id === null);
}

/**
 * Whether the caller may give `role` to a user of `tenantId`: the service-role
 * twin of the user_roles policies, since these writes bypass RLS. A super
 * admin may grant anything; anyone else needs one of `adminRoles` in that very
 * tenant and never grants super_admin.
 */
export function canGrantRole(
  roles: readonly CallerRole[],
  tenantId: string,
  role: string | undefined,
  adminRoles: readonly string[],
): boolean {
  if (isGlobalSuperAdmin(roles)) {
    return true;
  }
  if (role === "super_admin") {
    return false;
  }
  return roles.some(
    (r) => r.tenant_id === tenantId && adminRoles.includes(r.role),
  );
}
