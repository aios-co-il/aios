import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  il,
  liveFinding,
  privateRow,
  row,
  staffRow,
  thread,
} from "../../tests/chat-fixtures.ts";
import type { Verdicts } from "./classify.ts";
import { complaintCandidates } from "./complaints.ts";
import type { ChatVerdict } from "./verdict.ts";

const SINCE = new Date(il("00:00", "2026-10-20"));
const scope = {
  since: SINCE,
  clientIds: null,
  chatLink: (id: string) => `https://app.test/chat/${id}`,
};
const none: Verdicts = new Map();

const angry: ChatVerdict = {
  needs_reply: false,
  is_request: false,
  complaint_ids: ["c1"],
  urgency: "high",
  summary_he: "הלקוח שוקל לעזוב",
  confidence: 0.9,
};

Deno.test("complaintCandidates", async (t) => {
  await t.step("a complaint staff answered at once is still raised", () => {
    const answered = thread([
      staffRow({ message_id: "hi", created_at: il("08:00") }),
      row({
        message_id: "c1",
        created_at: il("13:30"),
        message_text: "אני לא מרוצה מהלידים",
      }),
      staffRow({
        message_id: "s1",
        created_at: il("13:40"),
        message_text: "נבדוק",
      }),
    ]);
    const [found] = complaintCandidates([answered], none, [], scope);
    assertEquals(
      [found.kind, found.fingerprint, found.source_event_at],
      ["client_complaint", "chat:group:111@g.us:complaint:c1", il("13:30")],
    );
    assert(
      found.summary_he.includes(
        'נראה שהלקוח מתלונן בקבוצה ב-27.10 בשעה 13:30: "אני לא מרוצה',
      ),
    );
    assertEquals(found.evidence.classified_by, "markers");
  });

  await t.step(
    "the model finds a complaint without a listed word, under the SLA",
    () => {
      const quiet = thread([
        staffRow({ message_id: "hi", created_at: il("08:00") }),
        row({
          message_id: "c1",
          created_at: il("13:50"),
          message_text: "הלידים שלכם זבל",
        }),
      ]);
      assertEquals(complaintCandidates([quiet], none, [], scope), []);
      const read: Verdicts = new Map([
        ["group:111@g.us", { messageId: "c1", verdict: angry }],
      ]);
      const [found] = complaintCandidates([quiet], read, [], scope);
      assertEquals(
        [
          found.fingerprint,
          found.evidence.classified_by,
          found.evidence.llm_summary_he,
        ],
        ["chat:group:111@g.us:complaint:c1", "llm", "הלקוח שוקל לעזוב"],
      );
      const unsure: Verdicts = new Map([
        [
          "group:111@g.us",
          { messageId: "c1", verdict: { ...angry, confidence: 0.4 } },
        ],
      ]);
      assertEquals(complaintCandidates([quiet], unsure, [], scope), []);
    },
  );

  await t.step(
    "the named line's streak is the finding, quoted on that line",
    () => {
      const thanked = thread([
        staffRow({ message_id: "hi", created_at: il("08:00") }),
        row({
          message_id: "c0",
          created_at: il("14:05"),
          message_text: "בוקר טוב",
        }),
        row({
          message_id: "c1",
          created_at: il("14:10"),
          message_text: "הלידים שלכם זבל, שוקל לעזוב",
        }),
        staffRow({
          message_id: "s1",
          created_at: il("14:20"),
          message_text: "נבדוק ונחזור אליך",
        }),
        row({
          message_id: "c2",
          created_at: il("14:25"),
          message_text: "הבנתי, מחכה",
        }),
      ]);
      const read: Verdicts = new Map([
        ["group:111@g.us", { messageId: "c2", verdict: angry }],
      ]);
      const found = complaintCandidates([thanked], read, [], scope);
      assertEquals(
        found.map((c) => [c.fingerprint, c.evidence.quote]),
        [["chat:group:111@g.us:complaint:c0", "הלידים שלכם זבל, שוקל לעזוב"]],
      );
      assert(found[0].summary_he.includes("בשעה 14:10"));
    },
  );

  await t.step(
    "a private-group complaint carries the time and a link only",
    () => {
      const [found] = complaintCandidates(
        [
          thread([
            privateRow({ message_id: "d1", message_text: "אני לא מרוצה בכלל" }),
          ]),
        ],
        none,
        [],
        scope,
      );
      const visible = found.summary_he + JSON.stringify(found.evidence);
      assert(!visible.includes("לא מרוצה"), visible);
      assert(found.summary_he.includes("https://app.test/chat/c1"));
    },
  );

  await t.step(
    "an open complaint stays reported as stored while in the read window",
    () => {
      const fingerprint = "chat:group:111@g.us:complaint:gone";
      const inWindow = liveFinding(
        "client_complaint",
        fingerprint,
        il("10:00", "2026-10-22"),
      );
      const old = liveFinding(
        "client_complaint",
        `${fingerprint}2`,
        il("10:00", "2026-10-19"),
      );
      const found = complaintCandidates([], none, [inWindow, old], scope);
      assertEquals(found, [inWindow.stored]);
      assertEquals(
        complaintCandidates([], none, [inWindow], {
          ...scope,
          clientIds: ["c2"],
        }),
        [],
      );
    },
  );

  await t.step(
    "a streak that began before the read keeps its open complaint",
    () => {
      const clipped = thread([
        row({
          message_id: "later",
          created_at: il("09:00"),
          message_text: "עדיין לא מרוצה",
        }),
      ]);
      const open = liveFinding(
        "client_complaint",
        "chat:group:111@g.us:complaint:first",
        il("09:00", "2026-10-26"),
      );
      assertEquals(complaintCandidates([clipped], none, [open], scope), [
        open.stored,
      ]);
    },
  );
});
