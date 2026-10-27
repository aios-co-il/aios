/** Dedupe of pulse instant alerts against pulse_instant_alert_log (AIO-226). */
import type {
  PulseAlertRuleType,
  PulseInstantAlertCandidate,
} from "../pulse-instant-alerts.ts";

export type InstantAlertLogRow = {
  fingerprint?: string | null;
  severity_score?: number | string | null;
};

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
 * Deterministic fingerprint for the client-level rules (rule:client:bucket).
 * campaign_exception keeps its own campaign/reason/target fingerprint.
 */
export function legacyRuleFingerprint(
  ruleType: Exclude<PulseAlertRuleType, "campaign_exception">,
  clientId: string,
  bucket: string,
): string {
  return `${ruleType}:${clientId}:${bucket}`;
}
