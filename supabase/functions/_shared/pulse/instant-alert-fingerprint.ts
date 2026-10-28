/**
 * Fingerprints for the client-level pulse rules (AIO-226): the dedupe key in
 * pulse_instant_alert_log, as rule:client:bucket. campaign_exception keeps
 * its own campaign/reason/target fingerprint.
 */
import { jerusalemYmd } from "../calendarTimeZone.ts";

/** no_contact: keyed by the last-contact Israel date, so a new contact re-arms it. */
export function noContactFingerprint(
  clientId: string,
  lastContactMs: number,
): string {
  const bucket = Number.isNaN(lastContactMs)
    ? "missing"
    : `last:${jerusalemYmd(new Date(lastContactMs))}`;
  return `no_contact:${clientId}:${bucket}`;
}

/** cpl_spike: one finding per client, whatever the spike size. */
export function cplSpikeFingerprint(clientId: string): string {
  return `cpl_spike:${clientId}:spike`;
}

/**
 * connection_lost: one open finding per client. The issue mix (stale sync,
 * stopped campaign, missing table) flaps between runs and must not resend.
 */
export function connectionLostFingerprint(clientId: string): string {
  return `connection_lost:${clientId}:open`;
}
