import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  dmRow,
  il,
  review,
  row,
  staffRow,
  thread,
} from "../../tests/chat-fixtures.ts";
import { requestCandidates, withVerdicts } from "./candidates.ts";
import type { ChatVerdict } from "./verdict.ts";

const link = (id: string) => `https://app.test/t/acme/chat/${id}`;
const noLink = () => null;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/;

const confident: ChatVerdict = {
  needs_reply: true,
  is_request: true,
  complaint_ids: [],
  urgency: "normal",
  summary_he: "מבקש לעדכן את המבצע",
  confidence: 0.9,
};

/** A group the team writes in, then the client's message. */
const teamGroup = (text: string, at = "09:05") =>
  thread([
    staffRow({ message_id: "hi", created_at: il("08:00") }),
    row({ message_id: "ask", created_at: il(at), message_text: text }),
  ]);

const asks = { markers: { request: true, complaint: false } };

Deno.test("requestCandidates", async (t) => {
  await t.step("a group request past the SLA quotes the client", () => {
    const text = `אפשר להעלות את המבצע החדש? ${"פרטים ".repeat(60)}`;
    const [found] = requestCandidates([review(teamGroup(text), asks)], link);
    assertEquals(
      [found.kind, found.severity, found.client_id],
      ["unanswered_request", "warning", "c1"],
    );
    assert(
      found.summary_he.startsWith(
        'לקוח א: הלקוח כתב בקבוצה ב-27.10 בשעה 09:05: "אפשר להעלות',
      ),
    );
    assert(found.summary_he.endsWith("ועדיין לא קיבל מענה (5 שעות עסקיות)"));
    const quote = String(found.evidence.quote);
    assertEquals([quote.length, quote.endsWith("…")], [200, true]);
    assertEquals(found.source_event_at, il("09:05"));
  });

  await t.step("an emoji at the quote's cut is kept whole or dropped", () => {
    const text = `אפשר לעדכן? ${"א".repeat(186)}🙏 תודה רבה על הכל`;
    const [found] = requestCandidates([review(teamGroup(text), asks)], noLink);
    const quote = String(found.evidence.quote);
    assert(!LONE_SURROGATE.test(quote), JSON.stringify(quote));
    assert(!LONE_SURROGATE.test(found.summary_he));
    assertEquals(quote.endsWith("🙏…"), true);
  });

  await t.step(
    "a direct chat or a private group carries the time and a link, never the text",
    () => {
      const secret = "סוד פרטי מאוד?";
      for (const built of [
        thread([dmRow({ message_text: secret })]),
        thread([row({ message_text: secret })]),
      ]) {
        const reviewed = review(built, { ...asks, verdict: confident });
        const [found] = requestCandidates([reviewed], link);
        const visible = found.summary_he + JSON.stringify(found.evidence);
        assert(!visible.includes("סוד"), visible);
        assert(!visible.includes("מבקש לעדכן"), visible);
        assert(
          found.summary_he.includes("לצ׳אט: https://app.test/t/acme/chat/c1"),
        );
      }
    },
  );

  await t.step("the LLM may add a request, never remove the markers'", () => {
    const quiet = teamGroup("יש עדכון");
    assertEquals(requestCandidates([review(quiet)], noLink), []);
    assertEquals(
      requestCandidates([review(quiet, { verdict: confident })], noLink).map(
        (c) => c.kind,
      ),
      ["unanswered_request"],
    );
    const denied = review(quiet, {
      ...asks,
      verdict: { ...confident, is_request: false, needs_reply: false },
    });
    assertEquals(requestCandidates([denied], noLink).length, 1);
  });

  await t.step("before the SLA only an open request stays", () => {
    const early = review(teamGroup("מתי?"), { ...asks, slaBreached: false });
    assertEquals(requestCandidates([early], noLink), []);
    const kept = review(teamGroup("שלום"), { slaBreached: false, open: true });
    assertEquals(requestCandidates([kept], noLink).length, 1);
  });

  await t.step(
    "a wait only from unmapped @lid senders is low confidence",
    () => {
      const unsure = thread([
        row({
          sender_match_key: null,
          sender_lid_unmapped: true,
          message_text: "מתי?",
        }),
      ]);
      const [found] = requestCandidates([review(unsure, asks)], noLink);
      assertEquals(
        [found.severity, found.evidence.low_confidence],
        ["info", true],
      );
      assert(found.summary_he.includes("(השולח לא זוהה בוודאות)"));
    },
  );
});

Deno.test("withVerdicts", async (t) => {
  /** The verdict withVerdicts gives the wait when the model read up to `messageId`. */
  const verdictAt = (wait: ReturnType<typeof review>, messageId: string) =>
    withVerdicts(
      [wait],
      new Map([["group:111@g.us", { messageId, verdict: confident }]]),
    )[0].verdict;

  await t.step("a verdict counts for the wait's last message", () => {
    const wait = review(teamGroup("יש עדכון"));
    assertEquals(verdictAt(wait, "ask"), confident);
    assertEquals(verdictAt(wait, "older"), null);
  });

  await t.step("the client's thanks after the line read keep it", () => {
    const thanked = review(
      thread([
        staffRow({ message_id: "hi", created_at: il("08:00") }),
        row({ message_id: "ask", created_at: il("09:00") }),
        row({ message_id: "ty", created_at: il("09:10"), message_text: "🙏" }),
      ]),
    );
    assertEquals(verdictAt(thanked, "ask"), confident);
    const more = review(
      thread([
        staffRow({ message_id: "hi", created_at: il("08:00") }),
        row({ message_id: "ask", created_at: il("09:00") }),
        row({
          message_id: "new",
          created_at: il("09:10"),
          message_text: "ועוד",
        }),
      ]),
    );
    assertEquals(verdictAt(more, "ask"), null, "a new line needs a new read");
  });

  await t.step("a read of an earlier wait never counts", () => {
    const later = review(
      thread([
        row({ message_id: "old", created_at: il("08:00") }),
        staffRow({ message_id: "s1", created_at: il("08:30") }),
        row({ message_id: "ask", created_at: il("09:00") }),
      ]),
    );
    assertEquals(verdictAt(later, "old"), null);
  });
});
