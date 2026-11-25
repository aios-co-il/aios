import type { DbClient } from "../_shared/supabase-clients.ts";

/** Persist enqueue statistics without overwriting a concurrent edit to an approval claim. */
export async function writeEnqueueStats(
  db: DbClient,
  tenantId: string,
  broadcastId: string,
  total: number,
  claimRevision?: string,
): Promise<string> {
  let query = db
    .from("broadcasts")
    .update({
      stats: { total, sent: 0, delivered: 0, failed: 0, opted_out: 0 },
    })
    .eq("id", broadcastId)
    .eq("tenant_id", tenantId);
  if (claimRevision) {
    query = query.eq("status", "paused").eq("updated_at", claimRevision);
  }
  const { data, error } = await query.select("updated_at").maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("broadcast_claim_lost");
  }
  return data.updated_at;
}
