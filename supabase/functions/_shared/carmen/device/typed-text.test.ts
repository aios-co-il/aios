import { assertEquals } from "jsr:@std/assert@1";
import { DEVICE_TYPE_TEXT_MAX } from "./contract.ts";
import { isTypableText } from "./typed-text.ts";

Deno.test("isTypableText", async (t) => {
  await t.step("takes text with line breaks and tabs, up to the limit", () => {
    for (const text of [
      "שלום",
      "a\nb\tc",
      "😀",
      "x".repeat(DEVICE_TYPE_TEXT_MAX),
    ]) {
      assertEquals(isTypableText(text), true, JSON.stringify(text));
    }
  });

  await t.step("refuses what the card could not show as it is", () => {
    for (const text of [
      "",
      "x".repeat(DEVICE_TYPE_TEXT_MAX + 1),
      "a\u0000b",
      "a\rb",
      "a\u001bb",
      "\uD83D",
      "a\uDE00",
      "a‮b",
      "a⁧b",
      "a‏b",
      null,
      42,
    ]) {
      assertEquals(isTypableText(text), false, JSON.stringify(text));
    }
  });
});
