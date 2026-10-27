import { assert, assertEquals } from "jsr:@std/assert@1";
import { il, row, thread } from "../../tests/chat-fixtures.ts";
import {
  type ChatVerdict,
  parseVerdict,
  verdictPrompt,
  verdictSaysComplaint,
  verdictSaysRequest,
} from "./verdict.ts";

const verdict: ChatVerdict = {
  needs_reply: true,
  is_request: false,
  is_complaint: false,
  urgency: "normal",
  summary_he: "שואל מתי עולה הקמפיין",
  confidence: 0.8,
};

Deno.test("verdictPrompt", async (t) => {
  await t.step("roles and Israel times, no phones or names", () => {
    const prompt = verdictPrompt(
      thread([
        row({ created_at: il("09:05"), message_text: "אפשר להעלות?" }),
        row({
          direction: "outbound",
          created_at: il("09:10"),
          message_text: "כן",
        }),
      ]).turns,
    );
    assert(prompt.includes("09:05 לקוח: אפשר להעלות?"));
    assert(prompt.includes("09:10 צוות: כן"));
    assert(!prompt.includes("501234567"));
    assert(!prompt.includes("לקוח א"));
  });

  await t.step("at most 15 turns and 2,000 characters", () => {
    const long = Array.from({ length: 30 }, (_, i) =>
      row({
        created_at: il(`10:${String(i).padStart(2, "0")}`),
        message_text: "א".repeat(300),
      }),
    );
    const lines = verdictPrompt(thread(long).turns)
      .split("\n")
      .filter((line) => line.includes(" לקוח: "));
    assert(lines.length <= 15);
    assert(lines.join("\n").length <= 2_000);
    assert(lines.at(-1)?.startsWith("10:29"), "keeps the newest turns");
  });
});

Deno.test("parseVerdict", async (t) => {
  await t.step("accepts the model's JSON or a cached object", () => {
    assertEquals(parseVerdict(JSON.stringify(verdict)), verdict);
    assertEquals(parseVerdict(verdict), verdict);
    assertEquals(parseVerdict({ ...verdict, urgency: "loud", confidence: 3 }), {
      ...verdict,
      urgency: "normal",
      confidence: 1,
    });
  });

  await t.step("rejects malformed answers", () => {
    for (const raw of [
      null,
      "not json",
      "[]",
      JSON.stringify({ needs_reply: "yes" }),
    ]) {
      assertEquals(parseVerdict(raw), null);
    }
  });
});

Deno.test("verdictSays", async (t) => {
  await t.step("only a confident verdict counts", () => {
    assertEquals(verdictSaysRequest(verdict), true);
    assertEquals(verdictSaysRequest({ ...verdict, confidence: 0.4 }), false);
    assertEquals(verdictSaysRequest(null), false);
    assertEquals(
      verdictSaysComplaint({ ...verdict, is_complaint: true }),
      true,
    );
    assertEquals(verdictSaysComplaint(verdict), false);
  });
});
