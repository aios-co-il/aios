// The Manus line a text or file send goes out from when the call names none
// (older callers), as before lines could be chosen (AIO-255).
import type { DbClient } from "../supabase-clients.ts";
import type { SenderLine } from "./line-store.ts";

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
