import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  asRecord,
  errorMessageOr,
  isRecord,
  parseJsonRecord,
} from "./unknown-record.ts";

Deno.test("isRecord accepts objects and rejects null and primitives", () => {
  assertStrictEquals(isRecord({ a: 1 }), true);
  assertStrictEquals(isRecord([]), true);
  assertStrictEquals(isRecord(null), false);
  assertStrictEquals(isRecord("x"), false);
  assertStrictEquals(isRecord(3), false);
});

Deno.test("asRecord falls back to an empty record", () => {
  const value = { id: "a" };
  assertStrictEquals(asRecord(value), value);
  assertEquals(asRecord(undefined), {});
  assertEquals(asRecord("text"), {});
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
  assertStrictEquals(errorMessageOr("plain"), "plain");
  assertStrictEquals(errorMessageOr(null), null);
});
