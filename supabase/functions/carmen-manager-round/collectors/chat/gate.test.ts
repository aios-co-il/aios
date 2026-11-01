import { assertEquals } from "jsr:@std/assert@1";
import {
  il,
  liveFinding,
  NOW,
  row,
  SETTINGS,
  thread,
} from "../../tests/chat-fixtures.ts";
import { gateThreads, waitFingerprint } from "./gate.ts";

const ask = (at: string, text = "אפשר לעדכן?") =>
  row({ message_id: `ask-${at}`, created_at: il(at), message_text: text });

Deno.test("gateThreads", async (t) => {
  await t.step("a wait past the SLA in business hours is reviewed", () => {
    // 09:00 -> 14:00 is 5 business hours; the SLA is 4.
    const [review] = gateThreads([thread([ask("09:00")])], [], SETTINGS, NOW);
    assertEquals(
      [review.slaBreached, review.waitingHours, review.markers.request],
      [true, 5, true],
    );
    assertEquals(review.fingerprint, "chat:group:111@g.us:ask-09:00");
  });

  await t.step("a recent wait waits, complaint or not", () => {
    assertEquals(gateThreads([thread([ask("12:30")])], [], SETTINGS, NOW), []);
    const complaint = thread([ask("13:50", "אני לא מרוצה מהלידים")]);
    assertEquals(gateThreads([complaint], [], SETTINGS, NOW), []);
  });

  await t.step("an answered thread is not reviewed", () => {
    const answered = thread([
      ask("09:00"),
      row({ direction: "outbound", created_at: il("09:30") }),
    ]);
    assertEquals(gateThreads([answered], [], SETTINGS, NOW), []);
  });

  await t.step(
    "an open request keeps its wait under review; a complaint does not",
    () => {
      const fresh = thread([ask("13:00")]);
      const fingerprint = "chat:group:111@g.us:ask-13:00";
      const [review] = gateThreads(
        [fresh],
        [liveFinding("unanswered_request", fingerprint, il("13:00"))],
        SETTINGS,
        NOW,
      );
      assertEquals([review.open, review.slaBreached], [true, false]);
      const complaint = liveFinding(
        "client_complaint",
        "chat:group:111@g.us:complaint:ask-13:00",
        il("13:00"),
      );
      assertEquals(gateThreads([fresh], [complaint], SETTINGS, NOW), []);
    },
  );
});

Deno.test("waitFingerprint", async (t) => {
  await t.step("a staff reply starts a new wait", () => {
    const after = thread([
      ask("08:00"),
      row({ direction: "outbound", created_at: il("09:00") }),
      ask("10:00"),
    ]);
    assertEquals(waitFingerprint(after, []), "chat:group:111@g.us:ask-10:00");
  });

  await t.step("a wait older than the read keeps its open finding", () => {
    const clipped = thread([ask("11:00"), ask("12:00")]);
    const older = il("09:00", "2026-10-20");
    const live = [
      liveFinding("unanswered_request", "chat:group:111@g.us:older", older),
      liveFinding("unanswered_request", "chat:group:999@g.us:other", older),
    ];
    assertEquals(waitFingerprint(clipped, live), "chat:group:111@g.us:older");
  });
});
