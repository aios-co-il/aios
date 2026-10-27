// The Manus line a file goes out from when the call names none (older
// callers), as before lines could be chosen.
import type { SenderLine } from "../_shared/report-sender/line-store.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** The caller's oldest active Manus line in the tenant. */
export async function ownManusLine(
  admin: DbClient,
  tenantId: string,
  userId: string,
): Promise<SenderLine | null> {
  const { data, error } = await admin
    .from("tenant_integrations")
    .select("id, tenant_id, user_id, api_key, settings")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("integration_type", "manus_wa")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}
