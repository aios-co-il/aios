import type { DbClient } from "../_shared/supabase-clients.ts";

/** The tenant owner's user id (user_roles role=owner), or null when the tenant has none; throws when the lookup fails. */
export async function tenantOwnerUserId(
  supabase: Pick<DbClient, "from">,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`tenant owner lookup failed: ${error.message}`);
  }
  return data?.user_id ?? null;
}
