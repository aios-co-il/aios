import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  asRecord,
  jsonObject,
  jsonString,
  jsonText,
  textOr,
  thrownMessage,
} from "./json-narrow.ts";

Deno.test("jsonObject keeps plain objects and drops other JSON values", () => {
  const obj = { a: 1, nested: { b: [1, 2] } };
  assertEquals(jsonObject(obj), obj);
  for (const value of [null, undefined, "text", 3, true, [1, 2]]) {
    assertEquals(jsonObject(value), {});
  }
});

Deno.test("thrownMessage mirrors optional message reads", () => {
  assertStrictEquals(thrownMessage(new Error("boom")), "boom");
  assertStrictEquals(thrownMessage({ message: "postgrest" }), "postgrest");
  assertStrictEquals(thrownMessage({ message: 0 }), 0);
  assertStrictEquals(thrownMessage({ code: 1 }), undefined);
  assertStrictEquals(thrownMessage("plain"), undefined);
  assertStrictEquals(thrownMessage(null), undefined);
  assertStrictEquals(thrownMessage(undefined), undefined);
});

Deno.test("asRecord keeps plain objects and drops other values", () => {
  assertEquals(asRecord({ a: 1, f: undefined }), { a: 1, f: undefined });
  for (const value of [null, undefined, "x", 1, [1]]) {
    assertEquals(asRecord(value), {});
  }
});

Deno.test("jsonString keeps strings only", () => {
  assertStrictEquals(jsonString("tok"), "tok");
  for (const value of [null, undefined, 1, { a: 1 }]) {
    assertStrictEquals(jsonString(value), undefined);
  }
});

Deno.test(
  "jsonText keeps scalars as text and stores structured values as JSON",
  () => {
    assertStrictEquals(jsonText("abc"), "abc");
    assertStrictEquals(jsonText(""), "");
    assertStrictEquals(jsonText(12345), "12345");
    assertStrictEquals(jsonText(false), "false");
    assertStrictEquals(jsonText({ a: 1 }), '{"a":1}');
    assertStrictEquals(jsonText([1, "x"]), '[1,"x"]');
    for (const value of [null, undefined]) {
      assertStrictEquals(jsonText(value), undefined);
    }
  },
);

Deno.test("textOr mirrors value || fallback", () => {
  assertStrictEquals(textOr("note", null), "note");
  assertStrictEquals(textOr(7, null), "7");
  assertStrictEquals(textOr({ a: 1 }, null), '{"a":1}');
  for (const value of ["", 0, false, null, undefined]) {
    assertStrictEquals(textOr(value, "fallback"), "fallback");
  }
});
