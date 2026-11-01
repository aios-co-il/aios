import { assertEquals } from "jsr:@std/assert@1";
import { isJsonObject } from "./json-object.ts";

Deno.test("isJsonObject", async (t) => {
  await t.step("only a JSON object, not an array, null or a scalar", () => {
    assertEquals(
      [{ a: 1 }, [], null, undefined, "x", 1, true].map(isJsonObject),
      [true, false, false, false, false, false, false],
    );
  });
});
