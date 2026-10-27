import { assert, assertEquals } from "jsr:@std/assert@1";
import { entry, window } from "../../tests/group-fixtures.ts";
import { digestPrompt, maskPhones } from "./prompt.ts";

Deno.test("maskPhones", () => {
  assertEquals(
    maskPhones("תתקשרו 050-1234567 או +972 52 111 2222, תקציב 5000"),
    "תתקשרו [טלפון] או [טלפון], תקציב 5000",
  );
});

Deno.test("digestPrompt", async (t) => {
  await t.step(
    "speakers are client or staff, never phones, with today's card",
    () => {
      const prompt = digestPrompt(
        window([
          { text: "אפשר להעלות את המבצע? 0521111111" },
          { text: "מעלים מחר", speaker: "staff" },
        ]),
        [entry("2026-11-01T08:00:00Z", "שיחה על המבצע")],
      );
      assert(prompt.includes("לקוח: אפשר להעלות את המבצע? [טלפון]"));
      assert(prompt.includes("צוות: מעלים מחר"));
      assert(prompt.includes("- שיחה על המבצע"));
      assert(!/0521111111|521111111/.test(prompt));
      assert(prompt.includes('"material"'));
    },
  );

  await t.step("a sender with no known phone is neither side", () => {
    const prompt = digestPrompt(
      window([{ text: "אישרתי את הבאנר", speaker: "unknown", key: null }]),
      [],
    );
    assert(prompt.includes("לא מזוהה: אישרתי את הבאנר"));
    assert(!prompt.includes("לקוח: אישרתי"));
  });

  await t.step("a long transcript keeps the newest messages", () => {
    const long = Array.from({ length: 40 }, (_, i) => ({
      id: `m${i}`,
      at: `2026-11-01T10:${String(i).padStart(2, "0")}:00Z`,
      text: `הודעה ${i} ${"א".repeat(260)}`,
    }));
    const prompt = digestPrompt(window(long), []);
    assert(prompt.includes("הודעה 39"));
    assert(!prompt.includes("הודעה 0 "));
  });
});
