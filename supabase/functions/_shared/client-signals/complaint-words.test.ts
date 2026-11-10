import { assertEquals } from "jsr:@std/assert@1";
import {
  hasComplaintWords,
  hasSeriousComplaintWords,
} from "./complaint-words.ts";

Deno.test("hasComplaintWords", async (t) => {
  await t.step("flags the Hebrew complaint words and the update type", () => {
    assertEquals(
      [
        "אני לא מרוצה מהקמפיין",
        "הלקוח כועס",
        "יש בעיה חמורה עם הלידים",
        "COMPLAINT",
        "תלונה על השירות",
      ].map(hasComplaintWords),
      [true, true, true, true, true],
    );
  });

  await t.step("tells serious complaint words from mild ones", () => {
    const serious = [
      "הלקוח כועס",
      "אנחנו רוצים לבטל את ההתקשרות",
      "מגיע לי החזר כספי",
      "אני פונה לעורך דין",
      "Refund now",
    ];
    assertEquals(serious.map(hasComplaintWords), [
      true,
      true,
      true,
      true,
      true,
    ]);
    assertEquals(serious.map(hasSeriousComplaintWords), [
      true,
      true,
      true,
      true,
      true,
    ]);
    assertEquals(
      ["אני לא מרוצה מהקמפיין", "תלונה על השירות", "אפשר לבטל את הפוסט?"].map(
        hasSeriousComplaintWords,
      ),
      [false, false, false],
    );
  });

  await t.step("leaves ordinary requests and thanks alone", () => {
    assertEquals(
      ["אפשר להעלות את המבצע?", "תודה רבה!", "יש בעיה קטנה בבאנר"].map(
        hasComplaintWords,
      ),
      [false, false, false],
    );
  });
});
