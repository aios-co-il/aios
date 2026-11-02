import { assertEquals } from "jsr:@std/assert@1";
import { clamp } from "./clamp.ts";

Deno.test("clamp", async (t) => {
  await t.step("collapses whitespace and keeps short text", () => {
    assertEquals(clamp("  שלום \n עולם ", 20), "שלום עולם");
  });

  await t.step("cuts long text with an ellipsis within the limit", () => {
    assertEquals(clamp("אבגדהוזחט", 5), "אבגד…");
  });

  await t.step("never splits an emoji into a lone surrogate", () => {
    const cut = clamp("אישור 👍👍👍", 8);
    assertEquals(cut, "אישור 👍…");
    assertEquals(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(cut), false);
  });

  await t.step("counts code points, as PostgreSQL does", () => {
    assertEquals(Array.from(clamp("😀".repeat(10), 4)).length, 4);
  });
});
