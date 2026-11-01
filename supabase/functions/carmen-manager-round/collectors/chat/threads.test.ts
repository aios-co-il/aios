import { assertEquals } from "jsr:@std/assert@1";
import { il, row, STAFF_KEY } from "../../tests/chat-fixtures.ts";
import type { ActivityRow } from "./activity.ts";
import { buildThreads, firstStaffTurnAfter } from "./threads.ts";

const roster = new Set([STAFF_KEY]);

Deno.test("buildThreads", async (t) => {
  await t.step("sorts staff from client turns", () => {
    const [thread] = buildThreads(
      [
        row({ message_id: "client", created_at: il("09:00") }),
        row({
          message_id: "out",
          direction: "outbound",
          created_at: il("09:10"),
        }),
        row({
          message_id: "aios",
          sent_by_user_id: "u1",
          created_at: il("09:20"),
        }),
        // A campaigner answering from her own phone arrives as inbound.
        row({
          message_id: "own",
          sender_match_key: STAFF_KEY,
          created_at: il("09:30"),
        }),
        row({
          message_id: "lid",
          sender_match_key: null,
          sender_lid_unmapped: true,
          created_at: il("09:40"),
        }),
      ],
      roster,
      [],
    );
    assertEquals(
      thread.turns.map((turn) => [turn.id, turn.by, turn.unsure]),
      [
        ["client", "client", false],
        ["out", "staff", false],
        ["aios", "staff", false],
        ["own", "staff", false],
        ["lid", "client", true],
      ],
    );
    assertEquals(
      thread.pending.map((turn) => turn.id),
      ["lid"],
    );
  });

  await t.step("a completed call after the message answers it", () => {
    const [thread] = buildThreads(
      [row({ message_id: "ask", created_at: il("09:00") })],
      roster,
      [
        { client_id: "c1", created_at: il("10:00") },
        { client_id: "c2", created_at: il("10:00") },
        { client_id: "c1", created_at: il("08:00", "2026-10-26") },
      ],
    );
    assertEquals(
      thread.turns.map((turn) => [turn.by, turn.via]),
      [
        ["client", "message"],
        ["staff", "call"],
      ],
    );
    assertEquals(thread.pending, []);
    assertEquals(
      firstStaffTurnAfter(thread, new Date(il("09:00")))?.via,
      "call",
    );
  });

  await t.step("one thread per key, with its kind and client", () => {
    const threads = buildThreads(
      [
        row({ message_id: "g" }),
        row({
          message_id: "d",
          thread_key: "dm:o:501234567",
          thread_kind: "dm",
          group_id: null,
        }),
      ],
      roster,
      [],
    );
    assertEquals(
      threads.map((thread) => [thread.key, thread.kind, thread.clientName]),
      [
        ["group:111@g.us", "group", "לקוח א"],
        ["dm:o:501234567", "dm", "לקוח א"],
      ],
    );
    assertEquals(firstStaffTurnAfter(threads[0], new Date(0)), null);
  });

  await t.step(
    "a group is open to the team only when a team phone wrote in it",
    () => {
      const open = (rows: ActivityRow[]) =>
        buildThreads(rows, roster, [])[0].openToTeam;
      const ask = row({ message_id: "ask" });
      assertEquals(open([ask]), false);
      // The line's own reply (outbound) is the operator, not the team.
      assertEquals(open([ask, row({ direction: "outbound" })]), false);
      assertEquals(open([ask, row({ sender_match_key: STAFF_KEY })]), true);
      const dm = { thread_key: "dm:o:501234567", thread_kind: "dm" };
      assertEquals(
        open([row(dm), row({ ...dm, sender_match_key: STAFF_KEY })]),
        false,
      );
    },
  );

  await t.step("a message read twice counts once", () => {
    const twice = row({ message_id: "same" });
    const [thread] = buildThreads([twice, twice], roster, []);
    assertEquals([thread.messageCount, thread.pending.length], [1, 1]);
  });
});
