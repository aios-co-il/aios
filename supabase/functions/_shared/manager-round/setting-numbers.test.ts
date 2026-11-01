import { assertEquals } from "jsr:@std/assert@1";
import { nonNegative, positive } from "./setting-numbers.ts";

Deno.test("positive", async (t) => {
  await t.step("a positive number or numeric text, else the fallback", () => {
    assertEquals(
      [5, "2.5", 0, -1, "x", null, Infinity].map((raw) => positive(raw, 7)),
      [5, 2.5, 7, 7, 7, 7, 7],
    );
  });
});

Deno.test("nonNegative", async (t) => {
  await t.step("zero counts; null, blank text and booleans fall back", () => {
    assertEquals(
      [0, "0", 3, -1, null, "", " ", true, "x"].map((raw) =>
        nonNegative(raw, 9),
      ),
      [0, 0, 3, 9, 9, 9, 9, 9, 9],
    );
  });
});
