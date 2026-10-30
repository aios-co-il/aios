/** Dedupe of pulse instant alerts against pulse_instant_alert_log (AIO-226). */
import type { Tables } from "../database.types.ts";
import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";
import type { DbClient } from "../supabase-clients.ts";

type InstantAlertLogRow = Partial<
  Pick<Tables<"pulse_instant_alert_log">, "fingerprint" | "severity_score">
>;

/**
 * True when this candidate must not go out: a matching log row inside the
 * rule's throttle window, or a failed lookup. A failed dedupe lookup must not
 * turn into a resend.
 */
export async function isInstantAlertSuppressed(
  input: { supabase: Pick<DbClient, "from">; tenantId: string },
  candidate: PulseInstantAlertCandidate,
  throttleHours: number,
  now: Date,
): Promise<boolean> {
  const { data, error } = await recentAlertDeliveries(
    input.supabase,
    [input.tenantId],
    candidate,
    throttleHours,
    now,
  );
  if (error) {
    console.warn("[pulse-instant-alerts] dedupe lookup failed", error.message);
    return true;
  }
  return !decideInstantAlertDelivery(candidate, data).send;
}

/**
 * Decide against the log rows of this client + rule (+ campaign) inside the
 * rule's throttle window, newest first. Any matching row suppresses a resend,
 * so a finding that flaps A → B → A inside the window is not sent again.
 * Only campaign_exception resends when it got materially (10%) worse.
 */
export function decideInstantAlertDelivery(
  candidate: Pick<
    PulseInstantAlertCandidate,
    "rule_type" | "fingerprint" | "severity_score"
  >,
  recentRows: InstantAlertLogRow[],
): { send: boolean; reason: "new" | "duplicate" | "materially_worse" } {
  const match = recentRows.find((row) =>
    isSameInstantAlertFinding(row.fingerprint, candidate.fingerprint),
  );
  if (!match) {
    return { send: true, reason: "new" };
  }
  if (
    candidate.rule_type === "campaign_exception" &&
    Number(candidate.severity_score || 0) >
      Number(match.severity_score || 0) * 1.1
  ) {
    return { send: true, reason: "materially_worse" };
  }
  return { send: false, reason: "duplicate" };
}

/**
 * pulse_instant_alert_log rows written before AIO-226 have fingerprint NULL
 * (the client-level rules had none). Inside the throttle window such a row is
 * the same finding, so deploying the fingerprints causes no resend wave.
 */
export function isSameInstantAlertFinding(
  loggedFingerprint: string | null | undefined,
  candidateFingerprint: string | null | undefined,
): boolean {
  const logged = loggedFingerprint ?? null;
  if (logged === null) {
    return true;
  }
  return logged === (candidateFingerprint ?? null);
}

/**
 * Up to 50 log rows of this client + rule (+ campaign) that `tenantIds` sent
 * inside the rule's throttle window, newest first, so a flap back to an
 * earlier finding still matches. The one window query for this org's dedupe
 * and the cross-org one (cross-tenant-recipients.ts).
 */
export async function recentAlertDeliveries(
  supabase: Pick<DbClient, "from">,
  tenantIds: string[],
  candidate: PulseInstantAlertCandidate,
  throttleHours: number,
  now: Date,
) {
  const since = new Date(
    now.getTime() - throttleHours * 60 * 60 * 1000,
  ).toISOString();
  let query = supabase
    .from("pulse_instant_alert_log")
    .select("recipient_phone, fingerprint, severity_score")
    .in("tenant_id", tenantIds)
    .eq("client_id", candidate.client_id)
    .eq("rule_type", candidate.rule_type)
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(50);
  if (candidate.campaign_key) {
    query = query.eq("campaign_key", candidate.campaign_key);
  }
  return await query;
}
