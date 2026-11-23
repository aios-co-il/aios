import type { DbClient } from "../_shared/supabase-clients.ts";

/** Claim eligible broadcasts before rebuilding recipients; failed preparation stays unsendable. */
export async function sendApprovedBroadcast(
  db: DbClient,
  tenantId: string,
  broadcastId: string,
  enqueue: () => Promise<{ total?: number; count?: number }>,
) {
  const { data: claimed, error } = await db
    .from("broadcasts")
    .update({ status: "paused" })
    .eq("id", broadcastId)
    .eq("tenant_id", tenantId)
    .in("status", ["draft", "scheduled"])
    .select("id, updated_at")
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!claimed) {
    throw new Error("broadcast_not_eligible");
  }
  try {
    const recipients = await enqueue();
    const { data: started, error: startError } = await db
      .from("broadcasts")
      .update({ status: "sending", started_at: new Date().toISOString() })
      .eq("id", broadcastId)
      .eq("tenant_id", tenantId)
      .eq("status", "paused")
      .eq("updated_at", claimed.updated_at)
      .select("id")
      .maybeSingle();
    if (startError) {
      throw startError;
    }
    if (!started) {
      throw new Error("broadcast_claim_lost");
    }
    return {
      success: true,
      broadcast_id: broadcastId,
      recipients: recipients.total ?? recipients.count ?? "?",
    };
  } catch (error) {
    const { error: failed } = await db
      .from("broadcasts")
      .update({ status: "failed" })
      .eq("id", broadcastId)
      .eq("tenant_id", tenantId)
      .eq("status", "paused")
      .eq("updated_at", claimed.updated_at);
    if (failed) {
      console.error("[sendApprovedBroadcast] failed to close claim", failed);
    }
    throw error;
  }
}
