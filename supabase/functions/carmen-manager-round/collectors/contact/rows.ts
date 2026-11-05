/** get_client_contact_evidence rows (or fixtures in their shape) as evidence. */
import type { Json } from "../../../_shared/database.types.ts";
import type {
  CallEvidence,
  ContactEvidence,
  MeetingEvidence,
} from "./evidence.ts";

type RawRow = { [key: string]: Json | undefined };

/** Rows with a client id and name, each as evidence. */
export function parseRows(rows: readonly (RawRow | Json)[]): ContactEvidence[] {
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

/** The row's oldest unlogged meeting, when it has one. */
function toMeeting(row: RawRow): MeetingEvidence | null {
  const id = text(row.unlogged_meeting_id);
  const at = text(row.unlogged_meeting_at);
  return id && at
    ? {
        id,
        key: text(row.unlogged_meeting_key) ?? `id:${id}`,
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
