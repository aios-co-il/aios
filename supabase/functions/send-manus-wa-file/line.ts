// The Manus line a file goes out from.
import {
  lineIsReady,
  type LineStore,
  loadSenderLine,
  type SenderLine,
} from "../_shared/report-sender/line-access.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

export type LineChoice =
  { line: SenderLine } | { error: "sender_not_allowed" | "not_configured" };

/**
 * A named line must be one the tenant may use, and is never swapped for
 * another. Without one (older callers), the caller's own Manus line in the
 * tenant, as before.
 */
export async function resolveManusLine(
  deps: {
    store: LineStore;
    ownManusLine(tenantId: string, userId: string): Promise<SenderLine | null>;
  },
  input: { tenantId: string; userId: string; integrationId: string | null },
): Promise<LineChoice> {
  const line = input.integrationId
    ? await loadSenderLine(deps.store, {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        type: "manus_wa",
      })
    : await deps.ownManusLine(input.tenantId, input.userId);
  if (!line) {
    return {
      error: input.integrationId ? "sender_not_allowed" : "not_configured",
    };
  }
  return lineIsReady(line) ? { line } : { error: "not_configured" };
}

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
