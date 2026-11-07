import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import { errorMessage } from "./error-message.ts";
import { jsonObject, jsonText } from "./json-object.ts";

Deno.test(
  "jsonObject returns objects and throws on null like property access",
  () => {
    const value = { id: "a", n: 1, nested: { list: [1, "x", null, true] } };
    assertEquals(jsonObject(value), value);
    assertEquals(jsonObject({}), {});
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
    assertStrictEquals(errorMessage({ code: "x" }), undefined);
    assertStrictEquals(errorMessage({ message: null }), undefined);
    assertStrictEquals(errorMessage("plain string"), undefined);
    assertStrictEquals(errorMessage(["boom"]), undefined);
    assertStrictEquals(errorMessage(null), undefined);
  },
);
