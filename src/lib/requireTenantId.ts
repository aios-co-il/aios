/** The tenant id for a write, or a clear error when no tenant is selected. */
export function requireTenantId(tenantId: string | null | undefined): string {
  if (!tenantId) throw new Error("לא נבחר ארגון (tenant)");
  return tenantId;
}
