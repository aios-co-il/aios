import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { throwIf } from "../manager-round/db-error.ts";

/**
 * Sets the user's module permissions in one tenant to exactly `modules`.
 * Grants before revoking, so a failed step never leaves the user with no
 * permissions there; other tenants' permissions are not touched.
 */
export async function replaceTenantPermissions(
  db: ReturnType<typeof createClient>,
  userId: string,
  tenantId: string,
  modules: Array<string>,
): Promise<void> {
  const { error } = await db.from("user_permissions").upsert(
    modules.map((module) => ({
      user_id: userId,
      tenant_id: tenantId,
      module,
      can_access: true,
    })),
    { onConflict: "user_id,tenant_id,module" },
  );
  throwIf(error, "Granting permissions failed");

  const { data, error: readError } = await db
    .from("user_permissions")
    .select("module")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  throwIf(readError, "Loading permissions failed");
  const others = (data ?? [])
    .map((row: { module: string }) => row.module)
    .filter((module: string) => !modules.includes(module));
  if (others.length === 0) {
    return;
  }

  const { error: revokeError } = await db
    .from("user_permissions")
    .delete()
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .in("module", others);
  throwIf(revokeError, "Revoking permissions failed");
}
