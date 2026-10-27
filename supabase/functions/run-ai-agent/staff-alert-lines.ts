import { isPrimaryCarmenLine } from "../_shared/carmen-connection-role.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { MANUS_WA_TYPES } from "../_shared/whatsapp/send-result.ts";

/** A Manus line a staff alert may leave from, and the user it belongs to. */
export type ManusLine = { id: string; user_id: string | null };

/** The tenant's active Manus lines (newest first) and which of them are primary; throws when the lookup fails. */
export async function loadManusLines(
  supabase: Pick<DbClient, "from">,
  tenantId: string,
): Promise<{ manus: ManusLine[]; primary: ManusLine[] }> {
  // settings carries carmen_role: only primary lines may send staff alerts.
  const { data, error } = await supabase
    .from("tenant_integrations")
    .select("id, user_id, integration_type, settings")
    .eq("tenant_id", tenantId)
    .in("integration_type", MANUS_WA_TYPES)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    throw new Error(`load Manus lines failed: ${error.message}`);
  }
  const manus = (data ?? []).filter((row) =>
    MANUS_WA_TYPES.includes(row.integration_type),
  );
  // A Manus row is itself an active Manus connection of the tenant.
  return {
    manus,
    primary: manus.filter((row) => isPrimaryCarmenLine(row, true)),
  };
}
