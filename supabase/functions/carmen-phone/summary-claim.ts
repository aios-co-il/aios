import type { DbClient } from "../_shared/supabase-clients.ts";
import type { PhoneCall } from "./calls.ts";

/**
 * Claims the right to send the call's summary: true once per call, so a retried webhook does not
 * send it twice.
 */
export async function claimSummarySend(
  db: DbClient,
  call: PhoneCall,
): Promise<boolean> {
  const { data, error } = await db
    .from("carmen_phone_calls")
    .update({ summary_sent_at: new Date().toISOString(), summary_error: null })
    .eq("id", call.id)
    .eq("tenant_id", call.tenantId)
    .is("summary_sent_at", null)
    .select("id");
  if (error) {
    throw new Error(`summary claim failed: ${error.message}`);
  }
  return (data ?? []).length > 0;
}

/**
 * Records why the summary reached nobody and releases the claim, so a retried webhook sends it
 * again.
 */
export async function releaseSummaryClaim(
  db: DbClient,
  call: PhoneCall,
  reason: string,
): Promise<void> {
  const { error } = await db
    .from("carmen_phone_calls")
    .update({ summary_sent_at: null, summary_error: reason })
    .eq("id", call.id)
    .eq("tenant_id", call.tenantId);
  if (error) {
    throw new Error(`summary failure not stored: ${error.message}`);
  }
}
