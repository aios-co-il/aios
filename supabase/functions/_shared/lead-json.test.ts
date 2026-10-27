import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { asJsonObject, asObject, thrownMessage } from "./lead-json.ts";

Deno.test(
  "asObject keeps plain objects and drops scalars, arrays and null",
  () => {
    const value = { a: 1 };
    assertStrictEquals(asObject(value), value);
    assertStrictEquals(asObject([1]), null);
    assertStrictEquals(asObject("x"), null);
    assertStrictEquals(asObject(null), null);
    assertStrictEquals(asObject(undefined), null);
  },
);

Deno.test("asJsonObject only returns JSON objects", () => {
  assertEquals(asJsonObject({ page_id: "1" }), { page_id: "1" });
  assertStrictEquals(asJsonObject(["a"]), null);
  assertStrictEquals(asJsonObject(3), null);
  assertStrictEquals(asJsonObject(null), null);
});

Deno.test(
  "thrownMessage reads message from errors and error-like objects",
  () => {
    assertStrictEquals(thrownMessage(new Error("boom")), "boom");
    assertStrictEquals(
      thrownMessage({ message: "pg failed", code: "23505" }),
      "pg failed",
    );
    assertStrictEquals(thrownMessage("plain string"), undefined);
    assertStrictEquals(thrownMessage(null), undefined);
  },
);
