import { assertStrictEquals } from "jsr:@std/assert@1";
import { normalizeCommand } from "./command-text.ts";

Deno.test("normalizeCommand", async (t) => {
  await t.step("trims and drops trailing sentence punctuation", () => {
    assertStrictEquals(normalizeCommand("  רענני דופק?! "), "רענני דופק");
    assertStrictEquals(normalizeCommand("מה הדופק ؟"), "מה הדופק");
    assertStrictEquals(normalizeCommand("דופק. בבקשה"), "דופק. בבקשה");
  });

  await t.step("a missing command is empty", () => {
    assertStrictEquals(normalizeCommand(null), "");
    assertStrictEquals(normalizeCommand(undefined), "");
  });
});
