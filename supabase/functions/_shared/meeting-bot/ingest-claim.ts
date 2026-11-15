// The one claim on a meeting-bot session's ingest (AIO-587). The Recall webhook
// and the meeting-bot-reconcile cron both finalize sessions; each takes this
// claim first so only one of them summarizes a meeting.

import type { DbClient } from "../supabase-clients.ts";

/** `status_detail` while a finalize run owns the session's ingest. */
export const INGESTING = "ingesting";
/** `status_detail` after a finalize run threw; the reconcile cron retries it. */
export const INGEST_ERROR = "ingest_error";
/** Past this, an ingest that never finished is treated as dead and retried. */
export const STALE_INGEST_MS = 15 * 60 * 1000;

/** The session fields the claim reads. */
export interface ClaimableSession {
  id: string;
  tenant_id: string;
  updated_at: string;
  ended_at: string | null;
  status_detail?: string | null;
}

/** True while a finalize run may still own this session's ingest. */
export function isIngesting(session: Pick<ClaimableSession, "status_detail">) {
  return session.status_detail === INGESTING;
}

/**
 * PostgREST `or` filter for sessions no live run is ingesting: anything not
 * marked `ingesting`, or an ingest whose last write is older than
 * {@link STALE_INGEST_MS}. `neq` skips nulls in SQL, hence the `is.null` term.
 */
export function notLiveIngestFilter(now: number): string {
  const staleBefore = new Date(now - STALE_INGEST_MS).toISOString();
  return `status_detail.is.null,status_detail.neq.${INGESTING},updated_at.lt.${staleBefore}`;
}

/**
 * Compare-and-swap the session into `processing/ingesting`. Succeeds only when
 * the row still has the `updated_at` the caller read and is not `done`, so of
 * two callers holding the same read, exactly one gets `true`.
 */
export async function claimSessionIngest(
  admin: Pick<DbClient, "from">,
  session: ClaimableSession,
): Promise<boolean> {
  const claimedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("meeting_bot_sessions")
    .update({
      status: "processing",
      status_detail: INGESTING,
      ended_at: session.ended_at ?? claimedAt,
      updated_at: claimedAt,
    })
    .eq("tenant_id", session.tenant_id)
    .eq("id", session.id)
    .eq("updated_at", session.updated_at)
    .neq("status", "done")
    .select("id")
    .maybeSingle();
  if (error) {
    throw new Error(`session claim failed: ${error.message}`);
  }
  return !!data;
}
