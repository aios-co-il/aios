import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { asRecord, errorMessageOr, parseJsonRecord } from "./unknown-record.ts";

Deno.test("asRecord keeps plain objects", () => {
  const value = { id: "a", nested: { n: 1 } };
  assertEquals(asRecord(value), value);
  assertEquals(asRecord({}), {});
});

Deno.test("asRecord falls back to an empty record for other values", () => {
  for (const raw of [undefined, null, "text", 3, true, [1, 2]]) {
    assertEquals(asRecord(raw), {});
  }
});

Deno.test(
  "parseJsonRecord reads objects and tolerates bad or non-object JSON",
  () => {
    assertEquals(parseJsonRecord('{"url":"https://x"}'), {
      url: "https://x",
    });
    assertEquals(parseJsonRecord("not json"), {});
    assertEquals(parseJsonRecord("null"), {});
    assertEquals(parseJsonRecord("42"), {});
    assertEquals(parseJsonRecord("[1]"), {});
  },
);

Deno.test("errorMessageOr mirrors e?.message ?? e", () => {
  assertStrictEquals(errorMessageOr(new Error("boom")), "boom");
  assertStrictEquals(
    errorMessageOr({ message: "pg failed", code: "23505" }),
    "pg failed",
  );
  const noMessage = { code: "x" };
  assertStrictEquals(errorMessageOr(noMessage), noMessage);
  const nullMessage = { message: null };
  assertStrictEquals(errorMessageOr(nullMessage), nullMessage);
  assertStrictEquals(errorMessageOr("plain"), "plain");
  assertStrictEquals(errorMessageOr(null), null);
});
