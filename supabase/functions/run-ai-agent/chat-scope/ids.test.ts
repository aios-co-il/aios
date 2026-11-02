import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { phoneTail, uuids } from "./ids.ts";
import { CA, CB } from "./test-fixtures.ts";

Deno.test("phoneTail", async (t) => {
  await t.step("last 9 digits of a phone or chat id, else empty", () => {
    assertStrictEquals(phoneTail("972501234567@c.us"), "501234567");
    assertStrictEquals(phoneTail("+972-50-123-4567"), "501234567");
    assertStrictEquals(phoneTail("12345"), "");
  });
});

Deno.test("uuids", async (t) => {
  await t.step("keeps distinct UUIDs, lowercased, and drops the rest", () => {
    assertEquals(uuids([CA, ` ${CA.toUpperCase()} `, "system", null, 7, CB]), [
      CA,
      CB,
    ]);
  });
});
