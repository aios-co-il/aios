import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Saves which of the source tenant's agencies the accessing tenant may use. Only the changed
 * shares are written: deleting and re-inserting an unchanged share would also end the re-shares
 * the accessing tenant made from it (20261026095310_agency_share_revoke_chain).
 */
export async function saveAgencyShares(
  db: SupabaseClient<Database>,
  input: {
    sourceTenantId: string;
    accessingTenantId: string;
    saved: string[];
    picked: string[];
  },
) {
  const picked = new Set(input.picked);
  const saved = new Set(input.saved);
  const remove = input.saved.filter((id) => !picked.has(id));
  const add = input.picked.filter((id) => !saved.has(id));

  if (remove.length > 0) {
    const { error } = await db
      .from("agency_tenant_access")
      .delete()
      .eq("source_tenant_id", input.sourceTenantId)
      .eq("accessing_tenant_id", input.accessingTenantId)
      .in("agency_id", remove);
    if (error) throw error;
  }
  if (add.length > 0) {
    const { error } = await db.from("agency_tenant_access").insert(
      add.map((agencyId) => ({
        source_tenant_id: input.sourceTenantId,
        agency_id: agencyId,
        accessing_tenant_id: input.accessingTenantId,
        access_level: "read_write",
      })),
    );
    if (error) throw error;
  }
}
