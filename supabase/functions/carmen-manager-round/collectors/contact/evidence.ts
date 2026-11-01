/**
 * Contact evidence per client from get_client_contact_evidence (service
 * role, no message text): the card's last logged contact, the last contact,
 * and the oldest call and meeting still waiting to be logged. A dry run
 * outside Production may pass the same rows as fixtures.contact.
 */
import type { Json } from "../../../_shared/database.types.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../../_shared/manager-round/db-error.ts";
import { parseRows } from "./rows.ts";

export type CallEvidence = {
  id: string;
  at: string;
  seconds: number;
  /** The person who made the call (mapped extension or click-to-call, in the tenant); else null. */
  attributedUserId: string | null;
  attributedName: string | null;
};

export type MeetingEvidence = {
  id: string;
  /** The same meeting on every run: 'bot:<session>' or 'zoom:<meeting id>'. */
  key: string;
  at: string;
  /** 'meeting_bot' or 'recording'. */
  source: string;
  summary: string | null;
};

export type ContactEvidence = {
  clientId: string;
  clientName: string;
  agencyId: string | null;
  /** When the client started; no contact is expected before it. */
  clientSince: string | null;
  lastLogAt: string | null;
  /** The last call, meeting or campaigner message since `contactSince`. */
  lastContactAt: string | null;
  unloggedCall: CallEvidence | null;
  unloggedMeeting: MeetingEvidence | null;
};

/** PostgREST returns at most this many rows per request (Supabase max_rows). */
const PAGE_ROWS = 1000;

/**
 * Evidence for the tenant's clients (or only `clientIds`): unlogged calls and
 * meetings since `since`, the last contact since `contactSince`. Read in
 * pages so a tenant with more clients than one response holds is complete.
 */
export async function loadContactEvidence(
  db: DbClient,
  input: {
    tenantId: string;
    since: Date;
    contactSince: Date;
    minCallSeconds: number;
    clientIds: string[] | null;
  },
): Promise<ContactEvidence[]> {
  const evidence: ContactEvidence[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await db
      .rpc("get_client_contact_evidence", {
        p_tenant_id: input.tenantId,
        p_since: input.since.toISOString(),
        p_contact_since: input.contactSince.toISOString(),
        p_min_call_seconds: input.minCallSeconds,
        p_client_ids: input.clientIds ?? undefined,
      })
      .range(from, from + PAGE_ROWS - 1);
    throwIf(error, "get_client_contact_evidence");
    const rows = data ?? [];
    evidence.push(...parseRows(rows));
    if (rows.length < PAGE_ROWS) {
      return evidence;
    }
  }
}

/** fixtures.contact rows in the function's shape, or null when there are none. */
export function fixtureEvidence(
  fixtures: Json | null,
): ContactEvidence[] | null {
  const rows =
    fixtures && typeof fixtures === "object" && !Array.isArray(fixtures)
      ? fixtures.contact
      : undefined;
  return Array.isArray(rows) ? parseRows(rows) : null;
}
