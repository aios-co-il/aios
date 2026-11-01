/** Rows and threads for the chat collector's tests (Israel time is UTC+2 here). */
import type { FindingKind } from "../../_shared/manager-round/kinds.ts";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { ActivityRow } from "../collectors/chat/activity.ts";
import type { LiveChatFinding, ThreadReview } from "../collectors/chat/gate.ts";
import { buildThreads, type Thread } from "../collectors/chat/threads.ts";
import type { ChatVerdict } from "../collectors/chat/verdict.ts";
import { TENANT } from "./fake-world.ts";

/** Tuesday 27.10.2026, 14:00 in Israel. */
export const NOW = new Date("2026-10-27T12:00:00Z");

export const SETTINGS = resolveManagerSettings(null);

export const CLIENT_KEY = "501234567";
export const STAFF_KEY = "502222222";

/** An Israel wall-clock time on 27.10.2026 (or `day`), as an ISO string. */
export function il(time: string, day = "2026-10-27"): string {
  return new Date(`${day}T${time}:00+02:00`).toISOString();
}

let next = 0;

/** A client message in the group thread of client c1 unless `fields` say otherwise. */
export function row(fields: Partial<ActivityRow> = {}): ActivityRow {
  next += 1;
  return {
    thread_key: "group:111@g.us",
    client_id: "c1",
    client_name: "לקוח א",
    client_tenant_id: TENANT,
    group_id: "g1",
    message_id: `m${next}`,
    created_at: il("09:00"),
    direction: "inbound",
    sender_match_key: CLIENT_KEY,
    sender_lid_unmapped: false,
    sent_by_user_id: null,
    message_text: "שלום",
    ...fields,
  };
}

/** A client message in a private group of client c1: no team member writes there. */
export function privateRow(fields: Partial<ActivityRow> = {}): ActivityRow {
  return row({ thread_key: "group:222@g.us", group_id: "g2", ...fields });
}

/** A staff member's message in the group (the team is in it). */
export function staffRow(fields: Partial<ActivityRow> = {}): ActivityRow {
  return row({ sender_match_key: STAFF_KEY, ...fields });
}

/** One thread from rows, with the staff key on the roster. */
export function thread(rows: ActivityRow[]): Thread {
  const [built] = buildThreads(rows, new Set([STAFF_KEY]), []);
  return built;
}

/** A review of a thread with no markers, verdict or open finding. */
export function review(
  built: Thread,
  fields: Partial<ThreadReview> = {},
): ThreadReview {
  return {
    thread: built,
    fingerprint: `chat:${built.key}:${built.pending[0]?.id ?? "none"}`,
    open: false,
    markers: { request: false, complaint: false },
    waitingHours: 5,
    slaBreached: true,
    verdict: null,
    ...fields,
  };
}

/** An open finding of the chat collector, stored for client c1 at `at`. */
export function liveFinding(
  kind: FindingKind,
  fingerprint: string,
  at: string,
): LiveChatFinding {
  return {
    kind,
    fingerprint,
    firstPendingAt: at,
    stored: {
      kind,
      fingerprint,
      severity: "warning",
      client_id: "c1",
      agency_id: "a1",
      source_event_at: at,
      summary_he: "לקוח א: כפי שנשמר",
      evidence: { first_pending_at: at },
      owner_user_id: null,
    },
  };
}

/** The model's read of the request in receiptRows (message c1). */
export const REPORT_VERDICT: ChatVerdict = {
  needs_reply: true,
  is_request: true,
  complaint_ids: [],
  urgency: "normal",
  summary_he: "הדוח החודשי לא הגיע",
  confidence: 0.9,
};

/** A wait with a request but no request marker (c1), then the client's receipt (c2). */
export function receiptRows(): ActivityRow[] {
  return [
    staffRow({ message_id: "hi", created_at: il("08:00") }),
    row({
      message_id: "c1",
      created_at: il("09:00"),
      message_text: "הדוח של החודש עוד לא הגיע",
    }),
    row({
      message_id: "c2",
      created_at: il("09:10"),
      message_text: "קיבלתי, תודה",
    }),
  ];
}
