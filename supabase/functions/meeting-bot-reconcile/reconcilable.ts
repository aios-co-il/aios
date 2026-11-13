// Which `processing` sessions the reconcile cron may finalize (AIO-587). The
// webhook marks the session it is ingesting; finalizing it here at the same
// time summarized meetings twice and undid the summary's meeting name.

/** Past this, an ingest that never finished is treated as dead and retried. */
export const STALE_INGEST_MS = 15 * 60 * 1000;

export interface ReconcileCandidate {
  status_detail: string | null;
  updated_at: string;
}

/** False while the webhook's ingest of this session may still be running. */
export function isReconcilable(
  session: ReconcileCandidate,
  now: number,
): boolean {
  if (session.status_detail !== "ingesting") {
    return true;
  }
  return now - new Date(session.updated_at).getTime() > STALE_INGEST_MS;
}
