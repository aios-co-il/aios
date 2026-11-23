import type { DbClient } from "../_shared/supabase-clients.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who called, as requireAuth reports it. */
export type SearchCaller = { kind: "user" | "service"; userId: string | null };

/**
 * The tenant whose search provider (DataForSEO / SerpAPI) pays for this call:
 * a signed-in user's active tenant, or for the service role (run-ai-agent,
 * after an approved Carmen request) the tenant_id it names. Null = refuse.
 */
export async function searchTenantId(
  caller: SearchCaller,
  body: { tenant_id?: unknown },
  userTenant: (userId: string) => Promise<string | null>,
): Promise<string | null> {
  if (caller.kind === "service") {
    const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
    return UUID.test(tenantId) ? tenantId : null;
  }
  return caller.userId ? await userTenant(caller.userId) : null;
}

/** A user's active tenant (user_active_tenant), else their first tenant_users row. */
export async function userActiveTenant(
  supabase: Pick<DbClient, "from">,
  userId: string,
): Promise<string | null> {
  const { data: activeTenant } = await supabase
    .from("user_active_tenant")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (activeTenant?.tenant_id) {
    return activeTenant.tenant_id;
  }
  const { data: tenantUser } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return tenantUser?.tenant_id ?? null;
}
