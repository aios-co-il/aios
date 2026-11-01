/**
 * no_contact (plan C19): no call, meeting, campaigner message or logged
 * contact for no_contact_days since the client started. The finding's event
 * is the moment the silence crossed the threshold (the collector reads the
 * last contact over twice the threshold, so it is still known then), so a
 * client already silent before the round was switched on stays in the feed
 * and is never alerted about (no replay). A critical threshold
 * (no_contact_critical_days) and a before/after query are AIO-253 phase 2.
 */
import type { FindingCandidate } from "../types.ts";
import type { ContactEvidence } from "./evidence.ts";
import { type ContactRules, noContactWindowMs } from "./rules.ts";
import { noContactSummary } from "./text.ts";

/** Clients nobody contacted or logged for no_contact_days, at `now`. */
export function noContactFindings(
  evidence: ContactEvidence[],
  rules: ContactRules,
  now: Date,
): FindingCandidate[] {
  return evidence.flatMap((client) => {
    const contact = latest([client.lastLogAt, client.lastContactAt]);
    const crossedAt = silenceCrossedAt(client, contact, rules, now);
    return crossedAt <= now.getTime()
      ? [finding(client, contact, crossedAt, rules)]
      : [];
  });
}

/**
 * When the silence reached no_contact_days: counted from the last contact or
 * the client's start, whichever is later; with neither known, from the start
 * of the window (already past, so never alerted).
 */
function silenceCrossedAt(
  client: ContactEvidence,
  contact: Date | null,
  rules: ContactRules,
  now: Date,
): number {
  const window = noContactWindowMs(rules);
  const since = latest([contact?.toISOString(), client.clientSince]);
  return since ? since.getTime() + window : now.getTime() - window;
}

/** The no_contact candidate of one client. */
function finding(
  client: ContactEvidence,
  contact: Date | null,
  crossedAt: number,
  rules: ContactRules,
): FindingCandidate {
  return {
    kind: "no_contact",
    fingerprint: `client:${client.clientId}`,
    severity: "warning",
    client_id: client.clientId,
    agency_id: client.agencyId,
    source_event_at: new Date(crossedAt).toISOString(),
    summary_he: noContactSummary(
      client.clientName,
      contact,
      rules.noContactDays,
    ),
    evidence: {
      last_contact_at: contact?.toISOString() ?? null,
      last_log_at: client.lastLogAt,
      no_contact_days: rules.noContactDays,
    },
    owner_user_id: null,
  };
}

/** The latest of some ISO times, or null when none is set. */
function latest(times: (string | null | undefined)[]): Date | null {
  const valid = times
    .map((time) => (time ? Date.parse(time) : Number.NaN))
    .filter((ms) => !Number.isNaN(ms));
  return valid.length ? new Date(Math.max(...valid)) : null;
}
