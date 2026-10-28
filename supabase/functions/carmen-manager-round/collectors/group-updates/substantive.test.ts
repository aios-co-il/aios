import { assertEquals } from "jsr:@std/assert@1";
import { isSubstantive } from "./substantive.ts";

Deno.test("isSubstantive", async (t) => {
  await t.step("placeholders, thanks and a bare ok do not count", () => {
    for (const text of [
      "",
      "[תמונה]",
      "[תגובה: 👍]",
      "תודה רבה!",
      "אוקיי",
      "👍",
      "ok.",
    ]) {
      assertEquals(isSubstantive(text), false, text);
    }
  });

  await t.step("two words, or one marker word on its own, count", () => {
    assertEquals(isSubstantive("מתי עולה הקמפיין?"), true);
    assertEquals(isSubstantive("מאשר"), true);
    assertEquals(isSubstantive("סבבה"), false);
  });
});
