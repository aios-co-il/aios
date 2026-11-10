import type { SyncMaskyooCdrArgs } from "./messaging-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing sync_maskyoo_cdr executor and side-effect order. */
export async function executeSyncMaskyooCdr(
  args: SyncMaskyooCdrArgs,
  context: ToolExecutionContext,
) {
  const { tenantId, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = context;

  const { from_date } = args;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-maskyoo-cdr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ tenant_id: tenantId, from_date }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { error: data.error || `סנכרון נכשל [${res.status}]` };
  }
  return { success: true, ...data };
}
