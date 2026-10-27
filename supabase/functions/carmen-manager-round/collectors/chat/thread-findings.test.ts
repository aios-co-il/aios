import { assert, assertEquals } from "jsr:@std/assert@1";
import type { FindingKind } from "../../../_shared/manager-round/kinds.ts";
import {
  il,
  liveFinding,
  NOW,
  receiptRows,
  REPORT_VERDICT,
  row,
  staffRow,
} from "../../tests/chat-fixtures.ts";
import {
  chatContext,
  type FakeChatFields,
  fakeChatSources,
} from "../../tests/fake-chat-sources.ts";
import { TENANT } from "../../tests/fake-world.ts";
import type { ActivityRow } from "./activity.ts";
import { threadFindings } from "./thread-findings.ts";

const ALL: FindingKind[] = ["unanswered_request", "client_complaint"];
const query = {
  tenantId: TENANT,
  connectionIds: ["owner"],
  since: new Date(NOW.getTime() - 7 * 86_400_000),
  clientIds: null,
};

function find(rows: ActivityRow[], fields: FakeChatFields = {}, kinds = ALL) {
  const sources = fakeChatSources(rows, fields);
  const run = threadFindings(chatContext(), sources.fake, query, kinds);
  return run.then((found) => ({ ...found, asked: sources.asked }));
}

const complaint = row({
  message_id: "c1",
  created_at: il("09:30"),
  message_text: "אני לא מרוצה מהלידים",
});

Deno.test("threadFindings", async (t) => {
  await t.step(
    "closes an answered wait; a quickly answered complaint stays",
    async () => {
      const found = await find(
        [
          row({ message_id: "g1", created_at: il("09:00") }),
          complaint,
          staffRow({ message_id: "s1", created_at: il("10:00") }),
        ],
        {
          live: [
            liveFinding(
              "unanswered_request",
              "chat:group:111@g.us:g1",
              il("09:00"),
            ),
          ],
        },
      );
      assertEquals(
        found.resolved.map((r) => [r.fingerprint, r.details.response_minutes]),
        [["chat:group:111@g.us:g1", 60]],
      );
      assertEquals(
        found.candidates.map((c) => [c.kind, c.fingerprint]),
        [["client_complaint", "chat:group:111@g.us:complaint:g1"]],
      );
    },
  );

  await t.step(
    "a finding closed for the same message is never raised again",
    async () => {
      const found = await find([complaint], {
        closed: ["client_complaint|chat:group:111@g.us:complaint:c1"],
      });
      assertEquals(found.candidates, []);
    },
  );

  await t.step(
    "a complaint without a listed word, answered and thanked before the run, is raised",
    async () => {
      const verdict = {
        needs_reply: false,
        is_request: false,
        complaint_lines: [2],
        urgency: "high",
        summary_he: "הלקוח שוקל לעזוב",
        confidence: 0.9,
      };
      const found = await find(
        [
          staffRow({ message_id: "hi", created_at: il("08:00") }),
          row({
            message_id: "c1",
            created_at: il("12:10"),
            message_text: "הלידים שלכם זבל, שוקל לעזוב",
          }),
          staffRow({
            message_id: "s1",
            created_at: il("12:20"),
            message_text: "נבדוק ונחזור אליך",
          }),
          row({
            message_id: "c2",
            created_at: il("12:25"),
            message_text: "תודה",
          }),
        ],
        { answer: JSON.stringify(verdict) },
      );
      assertEquals(found.asked.length, 1);
      assertEquals(
        found.candidates.map((c) => [c.kind, c.fingerprint, c.evidence.quote]),
        [
          [
            "client_complaint",
            "chat:group:111@g.us:complaint:c1",
            "הלידים שלכם זבל, שוקל לעזוב",
          ],
        ],
      );
    },
  );

  await t.step(
    "a request the model read stays a request after the client's thanks",
    async () => {
      const found = await find(
        [
          staffRow({ message_id: "hi", created_at: il("08:00") }),
          row({
            message_id: "c1",
            created_at: il("09:00"),
            message_text: "הדוח של החודש עוד לא הגיע",
          }),
          row({
            message_id: "c2",
            created_at: il("09:10"),
            message_text: "🙏",
          }),
        ],
        {
          reviews: new Map([
            ["group:111@g.us", { messageId: "c1", verdict: REPORT_VERDICT }],
          ]),
        },
      );
      assertEquals(found.asked.length, 0, "thanks need no new read");
      assertEquals(
        found.candidates.map((c) => [
          c.kind,
          c.fingerprint,
          c.evidence.classified_by,
        ]),
        [["unanswered_request", "chat:group:111@g.us:c1", "llm"]],
      );
      const [request] = found.candidates;
      assertEquals(
        request.summary_he,
        'לקוח א: הלקוח כתב בקבוצה ב-27.10 בשעה 09:00: "הדוח של החודש עוד לא הגיע" ועדיין לא קיבל מענה (5 שעות עסקיות)',
        "the request is quoted, not the thanks",
      );
      assertEquals(request.evidence.quote, "הדוח של החודש עוד לא הגיע");
    },
  );

  const met = {
    needs_reply: false,
    is_request: false,
    complaint_lines: [],
    urgency: "normal",
    summary_he: "הלקוח קיבל את הדוח",
    confidence: 0.9,
  };
  const receipt = receiptRows();
  const readUpToC1 = new Map([
    ["group:111@g.us", { messageId: "c1", verdict: REPORT_VERDICT }],
  ]);

  await t.step(
    "a receipt after the read sends the wait back to the model",
    async () => {
      const found = await find(receipt, {
        reviews: readUpToC1,
        answer: JSON.stringify(met),
      });
      assertEquals(found.asked.length, 1, "'קיבלתי' is read again");
      assertEquals(found.candidates, []);
    },
  );

  await t.step(
    "a receipt is not read once the request is open; the finding keeps the read that raised it",
    async () => {
      const live = [
        liveFinding(
          "unanswered_request",
          "chat:group:111@g.us:c1",
          il("09:00"),
        ),
      ];
      for (const kinds of [ALL, ["unanswered_request" as const]]) {
        const found = await find(
          receipt,
          { live, reviews: readUpToC1, answer: JSON.stringify(met) },
          kinds,
        );
        assertEquals(found.asked.length, 0, "no paid call it cannot use");
        assertEquals(
          found.candidates.map((c) => [
            c.kind,
            c.fingerprint,
            c.evidence.classified_by,
            c.evidence.llm_summary_he,
          ]),
          [
            [
              "unanswered_request",
              "chat:group:111@g.us:c1",
              "llm",
              "הדוח החודשי לא הגיע",
            ],
          ],
        );
      }
    },
  );

  await t.step(
    "without complaints only waits past the SLA go to the model",
    async () => {
      const team = staffRow({ message_id: "hi", created_at: il("08:00") });
      const fresh = row({
        message_id: "f1",
        created_at: il("13:50"),
        message_text: "יש עדכון",
      });
      const off = await find([team, fresh], {}, ["unanswered_request"]);
      assertEquals(off.asked.length, 0);
      const on = await find([team, fresh]);
      assertEquals(on.asked.length, 1, "complaints are read at any age");
      assert(!off.candidates.length);
    },
  );
});
