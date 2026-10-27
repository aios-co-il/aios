/**
 * contact_not_logged (plan C19): the oldest call or meeting no log covers,
 * once it is older than log_grace_hours. However many calls follow, it stays
 * the same finding until someone logs or it leaves the no_contact_days
 * window; then the next unlogged one, if any, is a new finding, so a
 * campaigner who never logs is still told after go-live. A call belongs to
 * the person who made it (mapped extension or click-to-call), else to
 * nobody, so the router asks the client's campaigners and never blames the
 * fallback user. Each finding carries the card entry to log on "תעדי <code>".
 */
import type { ContactDraft } from "../../../_shared/manager-round/contact-draft.ts";
import type { FindingCandidate } from "../types.ts";
import type {
  CallEvidence,
  ContactEvidence,
  MeetingEvidence,
} from "./evidence.ts";
import type { ContactRules } from "./rules.ts";
import {
  callDraft,
  callSummary,
  meetingDraft,
  meetingSummary,
} from "./text.ts";

const HOUR_MS = 3_600_000;

/** Each client's unlogged call and meeting that are past the grace at `now`. */
export function notLoggedFindings(
  evidence: ContactEvidence[],
  rules: ContactRules,
  now: Date,
): FindingCandidate[] {
  return evidence.flatMap((client) => [
    ...unloggedCall(client, rules, now),
    ...unloggedMeeting(client, rules, now),
  ]);
}

/** The client's oldest unlogged call, once past the grace. */
function unloggedCall(
  client: ContactEvidence,
  rules: ContactRules,
  now: Date,
): FindingCandidate[] {
  const call = client.unloggedCall;
  if (!call || !isPastGrace(call.at, rules, now)) {
    return [];
  }
  return [
    candidate(client, call, {
      fingerprint: `client:${client.clientId}:call:${call.id}`,
      summary: callSummary(client.clientName, call),
      owner: call.attributedUserId,
      facts: {
        evidence_type: "call",
        duration_seconds: call.seconds,
        caller_user_id: call.attributedUserId,
      },
      draft: callDraft(call),
    }),
  ];
}

/** The client's oldest unlogged meeting, once past the grace. */
function unloggedMeeting(
  client: ContactEvidence,
  rules: ContactRules,
  now: Date,
): FindingCandidate[] {
  const meeting = client.unloggedMeeting;
  if (!meeting || !isPastGrace(meeting.at, rules, now)) {
    return [];
  }
  return [
    candidate(client, meeting, {
      fingerprint: `client:${client.clientId}:meeting:${meeting.key}`,
      summary: meetingSummary(client.clientName, meeting),
      owner: null,
      facts: { evidence_type: "meeting", meeting_source: meeting.source },
      draft: meetingDraft(meeting),
    }),
  ];
}

/** The log grace after `at` is over. */
function isPastGrace(at: string, rules: ContactRules, now: Date): boolean {
  return Date.parse(at) + rules.logGraceHours * HOUR_MS <= now.getTime();
}

/** The candidate for one call or meeting; its event time is the contact itself. */
function candidate(
  client: ContactEvidence,
  event: CallEvidence | MeetingEvidence,
  parts: {
    fingerprint: string;
    summary: string;
    owner: string | null;
    facts: { [key: string]: string | number | null };
    draft: ContactDraft;
  },
): FindingCandidate {
  return {
    kind: "contact_not_logged",
    fingerprint: parts.fingerprint,
    severity: "warning",
    client_id: client.clientId,
    agency_id: client.agencyId,
    source_event_at: event.at,
    summary_he: parts.summary,
    evidence: {
      ...parts.facts,
      evidence_id: event.id,
      evidence_at: event.at,
      attributed: parts.owner !== null,
      draft: parts.draft,
    },
    owner_user_id: parts.owner,
  };
}
