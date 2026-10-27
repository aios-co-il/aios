import { assertEquals } from "jsr:@std/assert@1";
import {
  il,
  liveFinding,
  row,
  SETTINGS,
  thread,
} from "../../tests/chat-fixtures.ts";
import { answeredWaits } from "./answered.ts";
import { buildThreads } from "./threads.ts";

const open = liveFinding(
  "unanswered_request",
  "chat:group:111@g.us:ask",
  il("09:00"),
);

const answered = thread([
  row({ message_id: "ask", created_at: il("09:00") }),
  row({ direction: "outbound", created_at: il("11:30") }),
]);

Deno.test("answeredWaits", async (t) => {
  await t.step("a staff reply closes the wait with its response time", () => {
    assertEquals(answeredWaits([answered], [open], [], SETTINGS), [
      {
        kind: "unanswered_request",
        fingerprint: open.fingerprint,
        resolution: "answered",
        details: {
          answered_at: il("11:30"),
          answered_by: "message",
          response_minutes: 150,
          response_business_hours: 2.5,
        },
      },
    ]);
  });

  await t.step("a completed call answers too", () => {
    const [called] = buildThreads(
      [row({ message_id: "ask", created_at: il("09:00") })],
      new Set(),
      [{ client_id: "c1", created_at: il("10:00") }],
    );
    const [resolution] = answeredWaits([called], [open], [], SETTINGS);
    assertEquals(
      [resolution.details.answered_by, resolution.details.response_minutes],
      ["call", 60],
    );
  });

  await t.step("a reply never closes a complaint", () => {
    const complaint = liveFinding(
      "client_complaint",
      "chat:group:111@g.us:complaint:ask",
      il("09:00"),
    );
    assertEquals(answeredWaits([answered], [complaint], [], SETTINGS), []);
  });

  await t.step(
    "a wait still reported, unanswered or out of the read stays open",
    () => {
      const waiting = thread([
        row({ message_id: "ask", created_at: il("09:00") }),
      ]);
      assertEquals(
        answeredWaits([answered], [open], [open.stored], SETTINGS),
        [],
      );
      assertEquals(answeredWaits([waiting], [open], [], SETTINGS), []);
      assertEquals(answeredWaits([], [open], [], SETTINGS), []);
      assertEquals(
        answeredWaits(
          [answered],
          [{ ...open, firstPendingAt: null }],
          [],
          SETTINGS,
        ),
        [],
      );
    },
  );
});
