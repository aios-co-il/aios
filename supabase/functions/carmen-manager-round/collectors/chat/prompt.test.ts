import { assert, assertEquals } from "jsr:@std/assert@1";
import { il, row, staffRow, thread } from "../../tests/chat-fixtures.ts";
import { verdictPrompt } from "./prompt.ts";

Deno.test("verdictPrompt", async (t) => {
  await t.step("numbered roles and Israel times, no phones or names", () => {
    const { text } = verdictPrompt(
      thread([
        row({ created_at: il("09:05"), message_text: "אפשר להעלות?" }),
        row({
          direction: "outbound",
          created_at: il("09:10"),
          message_text: "כן",
        }),
      ]).turns,
      new Set(),
    );
    assert(text.includes("[1] 09:05 לקוח: אפשר להעלות?"));
    assert(text.includes("[2] 09:10 צוות: כן"));
    assert(!text.includes("501234567"));
    assert(!text.includes("לקוח א"));
  });

  await t.step("marks the new client lines and maps them to messages", () => {
    const built = thread([
      row({ message_id: "old", created_at: il("09:00") }),
      row({
        message_id: "c1",
        created_at: il("14:10"),
        message_text: "הלידים שלכם זבל",
      }),
      staffRow({ message_id: "s1", created_at: il("14:20") }),
      row({ message_id: "c2", created_at: il("14:25"), message_text: "תודה" }),
    ]);
    const { text, lineIds } = verdictPrompt(built.turns, new Set(["c1", "c2"]));
    assert(text.includes("[1] 09:00 לקוח: שלום"));
    assert(text.includes("[2*] 14:10 לקוח: הלידים שלכם זבל"));
    assert(text.includes("[4*] 14:25 לקוח: תודה"));
    assertEquals(lineIds, [null, "c1", null, "c2"]);
  });

  await t.step("at most 15 turns and 2,000 characters, newest kept", () => {
    const long = Array.from({ length: 30 }, (_, i) =>
      row({
        message_id: `l${i}`,
        created_at: il(`10:${String(i).padStart(2, "0")}`),
        message_text: "א".repeat(300),
      }),
    );
    const { text, lineIds } = verdictPrompt(
      thread(long).turns,
      new Set(long.map((r) => r.message_id)),
    );
    const lines = text.split("\n").filter((line) => line.includes(" לקוח: "));
    assert(lines.length <= 15);
    assert(lines.join("\n").length <= 2_000);
    assert(lines.at(-1)?.includes("10:29"), "keeps the newest turns");
    assertEquals(lineIds.at(-1), "l29");
    assertEquals(lineIds.length, lines.length);
  });
});
