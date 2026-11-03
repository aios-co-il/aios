// The lease on a green-api-webhook message claim (message-claim.ts): an
// unfinished claim may be taken over once it is older than the lease.
import type { DbClient } from "../_shared/supabase-clients.ts";

/**
 * Takes over a stale claim with a compare-and-set on processed_at, so of two
 * retries racing for it only one wins. Returns the processed_at it wrote, which
 * fences the new owner's claim, or null.
 */
export async function takeOverStaleClaim(
  db: ClaimDb,
  match: ClaimMatch,
  nowMs: number,
): Promise<string | null> {
  const { data: existing, error } = await db
    .from("processed_webhook_messages")
    .select("processed_at, completed_at")
    .match(match)
    .maybeSingle();
  if (error) {
    console.error("[green-api] message claim lookup failed", { match, error });
    return null;
  }
  if (!existing || !isClaimLeaseExpired(existing, nowMs)) {
    return null;
  }
  const takenAt = new Date(nowMs).toISOString();
  const { data: taken, error: takeError } = await db
    .from("processed_webhook_messages")
    .update({ processed_at: takenAt })
    .match({ ...match, processed_at: existing.processed_at })
    .is("completed_at", null)
    .select("external_message_id");
  if (takeError) {
    console.error("[green-api] stale message claim takeover failed", {
      match,
      error: takeError,
    });
    return null;
  }
  return (taken?.length ?? 0) > 0 ? takenAt : null;
}

/** What the claim helpers need of a Supabase client. */
export type ClaimDb = Pick<DbClient, "from">;

/** A claim row's key: processed_webhook_messages' unique columns. */
export type ClaimMatch = {
  provider: string;
  tenant_id: string;
  external_message_id: string;
};

/**
 * An unfinished claim older than this belongs to a delivery that died mid-way
 * (timeout, redeploy), so Green API's retry may take it over.
 */
export const MESSAGE_CLAIM_LEASE_MS = 5 * 60_000;

/** True when a claim was never completed and its lease has run out. */
export function isClaimLeaseExpired(
  claim: { processed_at: string | null; completed_at: string | null },
  nowMs: number,
  leaseMs: number = MESSAGE_CLAIM_LEASE_MS,
): boolean {
  if (claim.completed_at) {
    return false;
  }
  const claimedAt = claim.processed_at ? Date.parse(claim.processed_at) : NaN;
  return Number.isNaN(claimedAt) || nowMs - claimedAt >= leaseMs;
}
