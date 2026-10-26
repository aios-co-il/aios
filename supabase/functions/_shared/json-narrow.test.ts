import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  isJsonObject,
  isRecord,
  jsonObject,
  jsonText,
  textOr,
  thrownMessage,
} from "./json-narrow.ts";

Deno.test("jsonObject keeps plain objects and drops other JSON values", () => {
  const obj = { a: 1, nested: { b: [1, 2] } };
  assertStrictEquals(jsonObject(obj), obj);
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

Deno.test("isRecord accepts plain objects only", () => {
  assertStrictEquals(isRecord({ a: 1 }), true);
  for (const value of [null, undefined, "x", 1, [1]]) {
    assertStrictEquals(isRecord(value), false);
  }
});

Deno.test("isJsonObject accepts plain JSON objects only", () => {
  assertStrictEquals(isJsonObject({ a: 1 }), true);
  for (const value of [null, undefined, "x", 1, [1]]) {
    assertStrictEquals(isJsonObject(value), false);
  }
});

Deno.test("jsonText keeps scalars as text and drops structured values", () => {
  assertStrictEquals(jsonText("abc"), "abc");
  assertStrictEquals(jsonText(""), "");
  assertStrictEquals(jsonText(12345), "12345");
  assertStrictEquals(jsonText(false), "false");
  for (const value of [null, undefined, { a: 1 }, [1]]) {
    assertStrictEquals(jsonText(value), undefined);
  }
});

Deno.test("textOr mirrors value || fallback", () => {
  assertStrictEquals(textOr("note", null), "note");
  assertStrictEquals(textOr(7, null), "7");
  for (const value of ["", 0, false, null, undefined, { a: 1 }]) {
    assertStrictEquals(textOr(value, "fallback"), "fallback");
  }
});
