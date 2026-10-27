/**
 * Client threads as a timeline of client and staff turns. A message is the
 * staff's when it left the monitored line (outbound), was sent from AIOS, or
 * came from a roster phone (an @lid sender after wa_lid_map); a completed
 * call to the client is a staff turn too. Every other message is the
 * client's; an @lid sender wa_lid_map cannot resolve is marked unsure.
 */
import type { ActivityRow } from "./activity.ts";
import type { CompletedCall } from "./calls.ts";

export type Turn = {
  id: string;
  at: Date;
  by: "client" | "staff";
  via: "message" | "call";
  text: string;
  /** From an @lid sender wa_lid_map cannot resolve (maybe staff). */
  unsure: boolean;
};

export type Thread = {
  key: string;
  kind: "group" | "dm";
  clientId: string;
  clientName: string;
  /** Messages the activity read returned (calls not counted). */
  messageCount: number;
  /** Oldest first. */
  turns: Turn[];
  /** Client turns after the last staff turn, oldest first. */
  pending: Turn[];
};

/**
 * One thread per thread key, with the client's calls merged in. A message
 * read twice (pages of the activity read can overlap when new rows arrive
 * between them) counts once.
 */
export function buildThreads(
  rows: ActivityRow[],
  staffKeys: ReadonlySet<string>,
  calls: CompletedCall[],
): Thread[] {
  const byKey = new Map<string, Map<string, ActivityRow>>();
  for (const row of rows) {
    const thread = byKey.get(row.thread_key) ?? new Map();
    byKey.set(row.thread_key, thread.set(row.message_id, row));
  }
  return [...byKey.values()].map((threadRows) =>
    toThread([...threadRows.values()], staffKeys, calls),
  );
}

/** The first staff turn after `at`, or null while the client still waits. */
export function firstStaffTurnAfter(thread: Thread, at: Date): Turn | null {
  return (
    thread.turns.find((turn) => turn.by === "staff" && turn.at > at) ?? null
  );
}

/** A thread from its rows (one thread key) and the tenant's calls. */
function toThread(
  rows: ActivityRow[],
  staffKeys: ReadonlySet<string>,
  calls: CompletedCall[],
): Thread {
  const [first] = rows;
  const messages = rows.map((row) => messageTurn(row, staffKeys));
  const start = Math.min(...messages.map((turn) => turn.at.getTime()));
  const callTurns = calls
    .filter(
      (call) =>
        call.client_id === first.client_id &&
        Date.parse(call.created_at) >= start,
    )
    .map(callTurn);
  const turns = [...messages, ...callTurns].sort(
    (a, b) => a.at.getTime() - b.at.getTime(),
  );
  const lastStaff = turns.findLastIndex((turn) => turn.by === "staff");
  return {
    key: first.thread_key,
    kind: first.thread_kind === "group" ? "group" : "dm",
    clientId: first.client_id,
    clientName: first.client_name,
    messageCount: rows.length,
    turns,
    pending: turns.slice(lastStaff + 1),
  };
}

/** A message turn: staff when outbound, sent from AIOS or from a roster phone. */
function messageTurn(row: ActivityRow, staffKeys: ReadonlySet<string>): Turn {
  const staff =
    row.direction === "outbound" ||
    !!row.sent_by_user_id ||
    (!!row.sender_match_key && staffKeys.has(row.sender_match_key));
  return {
    id: row.message_id,
    at: new Date(row.created_at),
    by: staff ? "staff" : "client",
    via: "message",
    text: row.message_text ?? "",
    unsure: !staff && row.sender_lid_unmapped === true,
  };
}

/** A completed call as a staff turn at its start time. */
function callTurn(call: CompletedCall, index: number): Turn {
  return {
    id: `call:${index}:${call.created_at}`,
    at: new Date(call.created_at),
    by: "staff",
    via: "call",
    text: "",
    unsure: false,
  };
}
