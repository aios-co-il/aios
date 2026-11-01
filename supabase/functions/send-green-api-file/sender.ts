// The Green API line a file goes out from when the call names none (the
// chat screen), as before lines could be chosen (AIO-255).
import { lineIsReady } from "../_shared/report-sender/line-access.ts";
import type { SenderLine } from "../_shared/report-sender/line-store.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** The caller's own active line in the tenant, else its latest active line. */
export async function legacyGreenLine(
  client: DbClient,
  tenantId: string,
  userId: string,
): Promise<SenderLine | null> {
  const columns = "id, tenant_id, user_id, api_key, settings";
  const own = await client
    .from("tenant_integrations")
    .select(columns)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("integration_type", "green_api")
    .eq("is_active", true)
    .maybeSingle();
  if (own.error) {
    throw own.error;
  }
  if (own.data && lineIsReady(own.data)) {
    return own.data;
  }
  const latest = await client
    .from("tenant_integrations")
    .select(columns)
    .eq("tenant_id", tenantId)
    .eq("integration_type", "green_api")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) {
    throw latest.error;
  }
  return latest.data;
}
