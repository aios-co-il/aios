import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import { objectOrEmpty } from "../carmen-memory-backfill/legacy-rows.ts";
import { errorMessage } from "./error-message.ts";
import { jsonObject, jsonText } from "./json-object.ts";

Deno.test(
  "jsonObject returns objects and throws on null like property access",
  () => {
    const value = { id: "a", n: 1 };
    assertStrictEquals(jsonObject(value), value);
    assertEquals(jsonObject("text"), {});
    assertEquals(jsonObject([1, 2]), {});
    assertEquals(jsonObject(3), {});
    assertThrows(() => jsonObject(null), TypeError);
    assertThrows(() => jsonObject(undefined), TypeError);
  },
);

Deno.test("jsonText mirrors the text PostgREST stores for JSON values", () => {
  assertStrictEquals(jsonText("abc"), "abc");
  assertStrictEquals(jsonText(""), "");
  assertStrictEquals(jsonText(5), "5");
  assertStrictEquals(jsonText(false), "false");
  assertStrictEquals(jsonText({ a: 1 }), '{"a":1}');
  assertStrictEquals(jsonText(null), null);
  assertStrictEquals(jsonText(undefined), null);
});

Deno.test(
  "errorMessage reads message from errors and error-like objects",
  () => {
    assertStrictEquals(errorMessage(new Error("boom")), "boom");
    assertStrictEquals(errorMessage({ message: "postgrest" }), "postgrest");
    assertStrictEquals(errorMessage({ message: 42 }), "42");
    assertStrictEquals(errorMessage("plain string"), undefined);
    assertStrictEquals(errorMessage(null), undefined);
  },
);

Deno.test(
  "objectOrEmpty keeps objects and maps other values to an empty object",
  () => {
    const row = { id: "x" };
    assertStrictEquals(objectOrEmpty(row), row);
    assertEquals(objectOrEmpty(null), {});
    assertEquals(objectOrEmpty("s"), {});
  },
);
