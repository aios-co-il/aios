import { assertEquals } from "jsr:@std/assert@1";
import { jsonObject } from "./json-object.ts";

Deno.test("jsonObject", async (t) => {
  await t.step("an object is returned as it is", () => {
    const value = { a: 1, b: { c: "x" } };
    assertEquals(jsonObject(value), value);
  });

  await t.step("null, undefined, arrays and scalars are not objects", () => {
    assertEquals(
      [null, undefined, [1], "x", 3, true].map((value) => jsonObject(value)),
      [null, null, null, null, null, null],
    );
  });
});
