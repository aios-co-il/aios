import { assertEquals } from "jsr:@std/assert@1";
import {
  type ChatVerdict,
  parseModelVerdict,
  parseStoredVerdict,
  verdictComplaints,
  verdictSaysRequest,
} from "./verdict.ts";

const verdict: ChatVerdict = {
  needs_reply: true,
  is_request: false,
  complaint_ids: [],
  urgency: "normal",
  summary_he: "שואל מתי עולה הקמפיין",
  confidence: 0.8,
};

/** The model's answer for `verdict` naming complaint `lines`. */
const answer = (lines: unknown, fields: Partial<ChatVerdict> = {}) => {
  const { complaint_ids: _ids, ...rest } = { ...verdict, ...fields };
  return JSON.stringify({ ...rest, complaint_lines: lines });
};

Deno.test("parseModelVerdict", async (t) => {
  await t.step("maps the complaint lines to the new lines' messages", () => {
    const lineIds = ["m1", null, "m3"];
    assertEquals(parseModelVerdict(answer([1, 3, 1]), lineIds), {
      ...verdict,
      complaint_ids: ["m1", "m3"],
    });
  });

  await t.step(
    "a line it may not judge, or a made-up number, names nothing",
    () => {
      const parsed = parseModelVerdict(answer([2, 0, 7, 1.5, "1"]), [
        "m1",
        null,
      ]);
      assertEquals(parsed?.complaint_ids, []);
      assertEquals(parseModelVerdict(answer(undefined), ["m1"]), verdict);
    },
  );

  await t.step("clamps confidence and cuts a long summary whole", () => {
    const summary_he = `${"א".repeat(198)}😡 ועוד`;
    const parsed = parseModelVerdict(
      answer([], { confidence: 3, summary_he, urgency: "high" }),
      [],
    );
    assertEquals(
      [parsed?.confidence, parsed?.summary_he, parsed?.urgency],
      [1, `${"א".repeat(198)}😡…`, "high"],
    );
  });

  await t.step("rejects malformed answers", () => {
    for (const raw of [
      "not json",
      "[]",
      "null",
      JSON.stringify({ needs_reply: "yes" }),
    ]) {
      assertEquals(parseModelVerdict(raw, ["m1"]), null);
    }
  });
});

Deno.test("parseStoredVerdict", async (t) => {
  await t.step("reads a cached verdict with its complaint ids", () => {
    const stored = { ...verdict, complaint_ids: ["m1", 7, "m2"] };
    assertEquals(parseStoredVerdict(stored), {
      ...verdict,
      complaint_ids: ["m1", "m2"],
    });
    assertEquals(parseStoredVerdict({}), null);
  });
});

Deno.test("verdictSays", async (t) => {
  await t.step("only a confident verdict counts", () => {
    assertEquals(verdictSaysRequest(verdict), true);
    assertEquals(verdictSaysRequest({ ...verdict, confidence: 0.4 }), false);
    assertEquals(verdictSaysRequest(null), false);
    const angry = { ...verdict, complaint_ids: ["m1"] };
    assertEquals(verdictComplaints(angry), ["m1"]);
    assertEquals(verdictComplaints({ ...angry, confidence: 0.4 }), []);
    assertEquals(verdictComplaints(null), []);
  });
});
