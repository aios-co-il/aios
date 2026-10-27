// The Green API line a file goes out from (AIO-255).
import {
  lineIsReady,
  type LineStore,
  loadSenderLine,
  type SenderLine,
} from "../_shared/report-sender/line-access.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

export type GreenFileLine =
  { line: SenderLine } | { error: "sender_not_allowed" | "not_configured" };

/**
 * A named line must be one the tenant may use, own or shared, and is never
 * swapped for another: an invalid choice used to fall back silently to a
 * different phone. Without a named line (the chat screen), the caller's own
 * line, else the tenant's most recently updated one, as before.
 */
export async function resolveGreenFileLine(input: {
  store: LineStore;
  tenantId: string;
  integrationId: string | null;
  legacyLine: () => Promise<SenderLine | null>;
}): Promise<GreenFileLine> {
  if (!input.integrationId) {
    const line = await input.legacyLine();
    return line && lineIsReady(line) ? { line } : { error: "not_configured" };
  }
  const line = await loadSenderLine(input.store, {
    tenantId: input.tenantId,
    integrationId: input.integrationId,
    type: "green_api",
  });
  if (!line) {
    return { error: "sender_not_allowed" };
  }
  return lineIsReady(line) ? { line } : { error: "not_configured" };
}

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
