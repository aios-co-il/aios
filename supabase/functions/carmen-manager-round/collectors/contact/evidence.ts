/**
 * Contact evidence per client from get_client_contact_evidence (service
 * role, the tenant's own rows, no message text): the card's last logged
 * contact, the last contact, and the oldest call and meeting still waiting
 * to be logged. A dry run outside Production may pass the same rows as
 * fixtures.contact.
 */
import type { Json } from "../../../_shared/database.types.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";

export type CallEvidence = {
  id: string;
  at: string;
  seconds: number;
  /** The person the PBX extension named; null when nobody was (fallback, other providers). */
  attributedUserId: string | null;
  attributedName: string | null;
};

export type MeetingEvidence = {
  id: string;
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
  /** The last call, meeting or campaigner message in the window. */
  lastContactAt: string | null;
  unloggedCall: CallEvidence | null;
  unloggedMeeting: MeetingEvidence | null;
};

type RawRow = { [key: string]: Json | undefined };

/** Evidence for the tenant's clients (or only `clientIds`) since `since`. */
export async function loadContactEvidence(
  db: DbClient,
  input: {
    tenantId: string;
    since: Date;
    minCallSeconds: number;
    clientIds: string[] | null;
  },
): Promise<ContactEvidence[]> {
  const { data, error } = await db.rpc("get_client_contact_evidence", {
    p_tenant_id: input.tenantId,
    p_since: input.since.toISOString(),
    p_min_call_seconds: input.minCallSeconds,
    p_client_ids: input.clientIds ?? undefined,
  });
  throwIf(error, "get_client_contact_evidence");
  return parseRows(data ?? []);
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

/** Rows with a client id and name, each as evidence. */
function parseRows(rows: readonly (RawRow | Json)[]): ContactEvidence[] {
  return rows.flatMap((row) => {
    const evidence = isRawRow(row) ? toEvidence(row) : null;
    return evidence ? [evidence] : [];
  });
}

/** One row as evidence; null without a client. */
function toEvidence(row: RawRow): ContactEvidence | null {
  const clientId = text(row.client_id);
  const clientName = text(row.client_name);
  if (!clientId || !clientName) {
    return null;
  }
  return {
    clientId,
    clientName,
    agencyId: text(row.agency_id),
    clientSince: text(row.client_since),
    lastLogAt: text(row.last_log_at),
    lastContactAt: text(row.last_contact_at),
    unloggedCall: toCall(row),
    unloggedMeeting: toMeeting(row),
  };
}

/** The row's oldest unlogged call, when it has one. */
function toCall(row: RawRow): CallEvidence | null {
  const id = text(row.unlogged_call_id);
  const at = text(row.unlogged_call_at);
  const seconds = row.unlogged_call_seconds;
  return id && at
    ? {
        id,
        at,
        seconds: typeof seconds === "number" ? seconds : 0,
        attributedUserId: text(row.unlogged_call_user_id),
        attributedName: text(row.unlogged_call_user_name),
      }
    : null;
}

/** The row's oldest unlogged meeting or recording, when it has one. */
function toMeeting(row: RawRow): MeetingEvidence | null {
  const id = text(row.unlogged_meeting_id);
  const at = text(row.unlogged_meeting_at);
  return id && at
    ? {
        id,
        at,
        source: text(row.unlogged_meeting_source) ?? "recording",
        summary: text(row.unlogged_meeting_summary),
      }
    : null;
}

/** A plain JSON object (a row). */
function isRawRow(value: RawRow | Json): value is RawRow {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A non-empty string, else null. */
function text(value: Json | undefined): string | null {
  return typeof value === "string" && value ? value : null;
}
