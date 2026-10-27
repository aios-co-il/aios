/** Rows and threads for the chat collector's tests (Israel time is UTC+2 here). */
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { ActivityRow } from "../collectors/chat/activity.ts";
import type { ThreadReview } from "../collectors/chat/gate.ts";
import { buildThreads, type Thread } from "../collectors/chat/threads.ts";
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
    thread_kind: "group",
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

/** A direct-chat row of client c1. */
export function dmRow(fields: Partial<ActivityRow> = {}): ActivityRow {
  return row({
    thread_key: `dm:owner:${CLIENT_KEY}`,
    thread_kind: "dm",
    group_id: null,
    ...fields,
  });
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
    openKinds: [],
    markers: { request: false, complaint: false },
    waitingHours: 5,
    slaBreached: true,
    verdict: null,
    ...fields,
  };
}
