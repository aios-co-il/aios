import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  asList,
  asText,
  jsonObject,
  messageOf,
  nullableText,
  objectList,
  optString,
  optText,
  prop,
  statusFields,
  statusFilterSource,
  toJson,
} from "./automation-json.ts";

Deno.test("jsonObject keeps the same object and drops non-objects", () => {
  const config = { message_template: "hi" };
  assertStrictEquals(jsonObject(config), config);
  assertEquals(jsonObject(null), {});
  assertEquals(jsonObject("x"), {});
  assertEquals(jsonObject([1]), {});
});

Deno.test("list helpers keep arrays and plain-object items only", () => {
  assertEquals(asList("a,b"), []);
  assertEquals(objectList([{ id: 1 }, null, "x", [2]]), [{ id: 1 }]);
});

Deno.test("prop reads like optional chaining on JSON values", () => {
  assertStrictEquals(prop({ output: "ok" }, "output"), "ok");
  assertStrictEquals(prop("text", "output"), undefined);
  assertStrictEquals(prop(null, "output"), undefined);
  assertStrictEquals(prop(new Error("boom"), "message"), "boom");
});

Deno.test("text helpers", () => {
  assertStrictEquals(asText("a"), "a");
  assertStrictEquals(asText(5), "5");
  assertStrictEquals(asText({}), "");
  assertStrictEquals(optString(5), null);
  assertStrictEquals(nullableText(undefined), null);
  assertStrictEquals(nullableText(972), "972");
  assertEquals(statusFields({ status: "won", status_kind: 3 }), {
    status: "won",
    new_status: null,
    status_kind: null,
  });
  assertStrictEquals(optText(7), "7");
  assertStrictEquals(optText(true), null);
  assertEquals(statusFields({ status: 7, new_status: 8 }), {
    status: "7",
    new_status: "8",
    status_kind: null,
  });
  assertStrictEquals(
    statusFilterSource({ filter_status: 3 }).filter_status,
    "3",
  );
});

Deno.test("messageOf reads message from errors and error-like objects", () => {
  assertStrictEquals(messageOf(new Error("boom")), "boom");
  assertStrictEquals(
    messageOf({ message: "pg error", code: "23505" }),
    "pg error",
  );
  assertStrictEquals(messageOf("plain"), undefined);
  assertStrictEquals(messageOf({ message: "" }), undefined);
});

Deno.test("toJson matches what JSON.stringify sends", () => {
  assertEquals(toJson({ a: 1, b: undefined, c: [undefined] }), {
    a: 1,
    c: [null],
  });
  assertStrictEquals(toJson(undefined), undefined);
  assertStrictEquals(
    JSON.stringify({ payload: toJson({ d: new Date(0) }) }),
    JSON.stringify({ payload: { d: new Date(0) } }),
  );
});
